import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { clearAuditEvents, compileApprovedRules, draftRule, evaluateRuntimeCase, extractClaims, fetchApprovedPlans, fetchApprovedRules, fetchAuditEvents, fetchHealth, fetchRuntimeCases, fetchRuntimeTrace, promoteRuleToRuntime, recordAuditEvent, verbalizeTrace } from './api'
import { isVariable, labelAtom, parseLogicFragment } from './facts'
import { humanizeFact, humanizeMissingData, humanizeMissingDataBehavior, humanizeNextStep, humanizePlanId, humanizeReviewReason, humanizeRuleId } from './humanize'
import { explainFragment, getPredicateDefinition } from './predicate-vocabulary'
import { demoPresets, sampleSource } from './sample-data'
import type { ApprovedRuntimePlan, ApprovedRuntimeRule, AuditEvent, CandidateRule, Claim, LlmStatus, ReviewedRule, RuleCompilationResult, RuntimeCase, RuntimeTraceResponse, SourceType, TraceVerbalization } from './types'

type ReviewStatus = ReviewedRule['reviewStatus']

const canonicalConcepts = [
  'case(Case)',
  'score(Case, Metric, Value)',
  'cutoff(Metric, Cutoff)',
  'risk(Case, Level)',
  'decision(Case, Decision)',
  'activated_rule(Case, RuleId)',
  'requires_human_review(Case, Reason)',
  'processing(Case)',
  'personal_data(Case)',
  'legal_basis(Case, Basis)',
  'data_breach(Case)',
  'breach_risk(Case, Level)',
  'breach_hours_since_awareness(Case, Hours)',
  'notified_authority(Case)',
]

const defaultPreset = demoPresets[0]

function parseFactInput(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .map((line) => line.replace(/\.$/, ''))
}

type GuidedFactField = {
  key: string
  label: string
  predicate: string
  args: string[]
  inputIndexes: number[]
}

function deriveGuidedFactFields(rules: ApprovedRuntimeRule[]) {
  const fields = new Map<string, GuidedFactField>()

  for (const rule of rules) {
    for (const condition of rule.conditions) {
      const fragment = parseLogicFragment(condition)
      if (fragment.kind !== 'fact') continue

      const definition = getPredicateDefinition(fragment.predicate, fragment.arity)
      if (definition?.category !== 'case_input' || fragment.predicate === 'case') continue

      const inputIndexes = fragment.args
        .map((arg, index) => (isVariable(arg) && definition.args[index]?.role !== 'case' ? index : -1))
        .filter((index) => index >= 0)
      const key = `${fragment.predicate}(${fragment.args.join(',')})`
      fields.set(key, {
        key,
        label: `${definition.label}: ${fragment.args.filter((arg, index) => definition.args[index]?.role !== 'case' && !isVariable(arg)).map(labelAtom).join(', ') || fragment.predicate}`,
        predicate: fragment.predicate,
        args: fragment.args,
        inputIndexes,
      })
    }
  }

  return [...fields.values()].sort((a, b) => a.label.localeCompare(b.label))
}

function factFromGuidedField(field: GuidedFactField, caseId: string, values: Record<string, string>) {
  if (field.inputIndexes.length === 0 && values[field.key] !== 'true') return null

  const args = field.args.map((arg, index) => {
    if (arg === 'Case') return caseId
    if (!field.inputIndexes.includes(index)) return arg
    return values[`${field.key}:${index}`]?.trim() ?? ''
  })

  if (args.some((arg) => !arg)) return null
  return `${field.predicate}(${args.join(', ')})`
}

function LogicFragmentList({ items, conclusion = false }: { items: string[]; conclusion?: boolean }) {
  return (
    <ul className={conclusion ? 'entity-list conclusions domain-list' : 'entity-list domain-list'}>
      {items.map((item, index) => {
        const explanation = explainFragment(item)
        return (
          <li key={`${item}-${index}`} className={explanation.status === 'unknown' ? 'unknown-fragment' : undefined}>
            <span>{explanation.summary}</span>
            <div className="fragment-metadata" aria-label="Predicate mapping metadata">
              <span className={`fragment-pill ${explanation.status}`}>{explanation.status === 'known' ? 'known mapping' : 'raw fragment'}</span>
              {explanation.predicate && <span className="fragment-pill neutral">{explanation.predicate}/{explanation.arity}</span>}
              {explanation.category && <span className="fragment-pill neutral">{explanation.category.replace(/_/g, ' ')}</span>}
              {explanation.label && <span className="fragment-pill neutral">{explanation.label}</span>}
            </div>
            <code>{item}</code>
          </li>
        )
      })}
    </ul>
  )
}

function PredicateCoverage({ conditions, conclusions }: { conditions: string[]; conclusions: string[] }) {
  const explanations = [...conditions, ...conclusions].map(explainFragment)
  const known = explanations.filter((explanation) => explanation.status === 'known').length
  const unknown = explanations.length - known

  return (
    <div className="predicate-coverage" aria-label="Predicate vocabulary coverage">
      <span className="fragment-pill known">{known} known</span>
      <span className={unknown > 0 ? 'fragment-pill unknown' : 'fragment-pill neutral'}>{unknown} raw</span>
    </div>
  )
}

function PredicateReviewPanel({ conditions, conclusions }: { conditions: string[]; conclusions: string[] }) {
  const explanations = [...conditions, ...conclusions].map(explainFragment)
  const unknown = explanations.filter((explanation) => explanation.status === 'unknown')

  return (
    <section className="rule-entity-card predicate-review-card">
      <span className="entity-label">Predicate review</span>
      <h3>{unknown.length === 0 ? 'Vocabulary mapped' : 'Mapping required'}</h3>
      {unknown.length === 0 ? (
        <p>Every condition and conclusion is covered by the predicate vocabulary or a known expression.</p>
      ) : (
        <>
          <p>These fragments are valid raw logic, but need vocabulary mapping or explicit reviewer acceptance before reuse in guided forms.</p>
          <ul className="entity-list domain-list">
            {unknown.map((explanation) => (
              <li key={explanation.source} className="unknown-fragment">
                <span>{explanation.summary}</span>
                <code>{explanation.source}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function StepHint({ children }: { children: ReactNode }) {
  return <p className="step-hint">{children}</p>
}

function RuleEntityCards({ rule }: { rule: CandidateRule }) {
  return (
    <div className="rule-entity-grid" aria-label="Readable candidate rule fields">
      <section className="rule-entity-card prominent">
        <span className="entity-label">Rule identity</span>
        <h3>{rule.title || rule.ruleId}</h3>
        <p>
          Stable identifier: <strong>{rule.ruleId}</strong>
        </p>
        <p>
          Domain: <strong>{rule.domain}</strong> · Type: <strong>{rule.ruleType}</strong>
        </p>
        <PredicateCoverage conditions={rule.conditions} conclusions={rule.conclusions} />
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">Source grounding</span>
        <h3>{rule.source.sourceId}</h3>
        <blockquote>{rule.source.quote}</blockquote>
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">When this rule applies</span>
        <h3>Conditions</h3>
        <LogicFragmentList items={rule.conditions} />
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">What the rule produces</span>
        <h3>Conclusions</h3>
        <LogicFragmentList items={rule.conclusions} conclusion />
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">Safety behavior</span>
        <h3>Missing data</h3>
        <p>{humanizeMissingDataBehavior(rule.missingDataBehavior)}</p>
      </section>

      <PredicateReviewPanel conditions={rule.conditions} conclusions={rule.conclusions} />

      <section className="rule-entity-card">
        <span className="entity-label">Review state</span>
        <h3>Draft only</h3>
        <p>This rule is not runtime knowledge until a human approves it.</p>
        {rule.humanReview.reviewNotes.length > 0 && (
          <ul className="entity-list domain-list">
            {rule.humanReview.reviewNotes.map((note) => <li key={note}><span>{note}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  )
}

function TraceList({ title, items, humanize = (item: string) => item }: { title: string; items: string[]; humanize?: (item: string) => string }) {
  return (
    <section className="trace-list-card">
      <span className="entity-label">{title}</span>
      {items.length === 0 ? <p>No entries.</p> : (
        <ul className="entity-list domain-list">
          {items.map((item) => (
            <li key={item}>
              <span>{humanize(item)}</span>
              <code>{item}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ApprovedRuleCard({ rule, active = false }: { rule: ApprovedRuntimeRule; active?: boolean }) {
  return (
    <article className={active ? 'approved-rule-card active' : 'approved-rule-card'}>
      <div className="approved-rule-topline">
        <span className="state-pill approved">approved</span>
        {active && <span className="state-pill active-rule">activated</span>}
      </div>
      <h3>{rule.title}</h3>
      <p><strong>{rule.ruleId}</strong></p>
      <p>Source: {rule.source.sourceId}</p>
      <PredicateCoverage conditions={rule.conditions} conclusions={rule.conclusions} />
      <details className="compact-details">
        <summary>Runtime details</summary>
        <p>Runtime: {rule.runtimeImplementation.activatedRuleFact}</p>
      </details>
      {rule.artifactPath && <small>{rule.artifactPath}</small>}
    </article>
  )
}

function ApprovedPlanCard({ plan, active = false }: { plan: ApprovedRuntimePlan; active?: boolean }) {
  return (
    <article className={active ? 'approved-rule-card active approved-plan-card' : 'approved-rule-card approved-plan-card'}>
      <span className="state-pill approved">approved plan</span>
      <h3>{plan.title}</h3>
      <p><strong>{plan.planId}</strong></p>
      <p>When decision is <code>{plan.trigger.decision}</code>, emit goal <code>{plan.planningGoal}</code>.</p>
      <ul className="compact-list">
        {plan.nextSteps.map((step) => <li key={step}>{humanizeNextStep(step)}</li>)}
      </ul>
      <details className="compact-details">
        <summary>Plan details</summary>
        <p>Source: {plan.source.sourceId}</p>
        <p>Runtime: {plan.runtimeImplementation.approvedPlanFact}</p>
      </details>
      {plan.artifactPath && <small>{plan.artifactPath}</small>}
    </article>
  )
}

function groupByDomain<T extends { domain: string }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    groups[item.domain] = groups[item.domain] ? [...groups[item.domain], item] : [item]
    return groups
  }, {})
}

function AuditTrail({ events, onRefresh, onClear }: { events: AuditEvent[]; onRefresh: () => void; onClear: () => void }) {
  return (
    <article className="cm-card audit-trail-card">
      <div className="cm-card-title">
        <h2>Audit trail</h2>
        <p>{events.length} recent observability events.</p>
      </div>
      <div className="cm-actions compact-actions">
        <button type="button" className="cm-button secondary" onClick={onRefresh}>Refresh</button>
        <button type="button" className="cm-button danger" onClick={onClear}>Clear local log</button>
      </div>
      <div className="audit-event-list">
        {events.length === 0 ? <p className="empty-state">No events yet.</p> : events.map((event) => (
          <section key={event.eventId} className={`audit-event ${event.status}`}>
            <div className="audit-event-topline">
              <strong>{event.eventType}</strong>
              <span>{event.status}</span>
            </div>
            <p>{event.actor} · {new Date(event.timestamp).toLocaleTimeString()}</p>
            <code>{JSON.stringify(event.details)}</code>
          </section>
        ))}
      </div>
    </article>
  )
}

export function App() {
  const [activeDemoId, setActiveDemoId] = useState(defaultPreset.id)
  const [sourceId, setSourceId] = useState(sampleSource.sourceId)
  const [domain, setDomain] = useState(sampleSource.domain)
  const [sourceType, setSourceType] = useState<SourceType>(sampleSource.sourceType)
  const [sourceText, setSourceText] = useState(sampleSource.text)
  const [claims, setClaims] = useState<Claim[]>([])
  const [selectedClaimId, setSelectedClaimId] = useState<string>('')
  const [candidateRule, setCandidateRule] = useState<CandidateRule | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewedRules, setReviewedRules] = useState<ReviewedRule[]>([])
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null)
  const [runtimeCases, setRuntimeCases] = useState<RuntimeCase[]>([])
  const [approvedRules, setApprovedRules] = useState<ApprovedRuntimeRule[]>([])
  const [approvedPlans, setApprovedPlans] = useState<ApprovedRuntimePlan[]>([])
  const [selectedRuntimeCase, setSelectedRuntimeCase] = useState('gc04')
  const [customCaseId, setCustomCaseId] = useState(defaultPreset.customCaseId)
  const [customFactsText, setCustomFactsText] = useState(defaultPreset.customFacts)
  const [guidedFactValues, setGuidedFactValues] = useState<Record<string, string>>({})
  const [runtimeTrace, setRuntimeTrace] = useState<RuntimeTraceResponse | null>(null)
  const [traceVerbalization, setTraceVerbalization] = useState<TraceVerbalization | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [compilationResult, setCompilationResult] = useState<RuleCompilationResult | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isRuntimeBusy, setIsRuntimeBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHealth()
      .then((health) => setLlmStatus(health.llm))
      .catch((err: Error) => setError(err.message))
    fetchRuntimeCases()
      .then((result) => setRuntimeCases(result.cases))
      .catch((err: Error) => setError(err.message))
    fetchApprovedRules()
      .then((result) => setApprovedRules(result.rules))
      .catch((err: Error) => setError(err.message))
    fetchApprovedPlans()
      .then((result) => setApprovedPlans(result.plans))
      .catch((err: Error) => setError(err.message))
    refreshAuditEvents()
  }, [])

  const selectedClaim = claims.find((claim) => claim.claimId === selectedClaimId) ?? claims[0]
  const guidedFactFields = deriveGuidedFactFields(approvedRules)
  const customFactPreview = parseFactInput(customFactsText)
  const activeApprovedRules = runtimeTrace
    ? approvedRules.filter((rule) => runtimeTrace.trace.activatedRules.includes(rule.ruleId))
    : []
  const activeApprovedPlans = runtimeTrace
    ? approvedPlans.filter((plan) => runtimeTrace.trace.activatedPlans.includes(plan.planId))
    : []
  const rulesByDomain = groupByDomain(approvedRules)
  const plansByDomain = groupByDomain(approvedPlans)
  const activeDemo = demoPresets.find((preset) => preset.id === activeDemoId) ?? defaultPreset
  const activeDemoRuntimeCases = runtimeCases.filter((runtimeCase) => activeDemo.benchmarkCaseIds.includes(runtimeCase.caseId))

  async function handleExtractClaims() {
    setIsBusy(true)
    setError(null)
    setCandidateRule(null)
    try {
      const result = await extractClaims({ sourceId, domain, sourceType, text: sourceText })
      setClaims(result.claims)
      setSelectedClaimId(result.claims[0]?.claimId ?? '')
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to extract claims')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDraftRule() {
    if (!selectedClaim) return
    setIsBusy(true)
    setError(null)
    try {
      const result = await draftRule({
        domain,
        canonicalConcepts,
        claim: { ...selectedClaim, sourceId },
      })
      setCandidateRule(result)
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to draft rule')
    } finally {
      setIsBusy(false)
    }
  }

  function loadSourcePreset(presetId: typeof activeDemoId) {
    const preset = demoPresets.find((item) => item.id === presetId) ?? defaultPreset
    setActiveDemoId(preset.id)
    setSourceId(preset.source.sourceId)
    setDomain(preset.source.domain)
    setSourceType(preset.source.sourceType)
    setSourceText(preset.source.text)
    setClaims([])
    setSelectedClaimId('')
    setCandidateRule(null)
    setReviewNotes('')
    setCustomCaseId(preset.customCaseId)
    setCustomFactsText(preset.customFacts)
    setSelectedRuntimeCase(preset.benchmarkCaseIds[0])
    setRuntimeTrace(null)
    setTraceVerbalization(null)
    setError(null)
  }

  function loadPreparedCandidate(presetId = activeDemoId) {
    const preset = demoPresets.find((item) => item.id === presetId) ?? defaultPreset
    loadSourcePreset(preset.id)
    setClaims(preset.claims)
    setSelectedClaimId(preset.claims[0].claimId)
    setCandidateRule(preset.candidateRule)
  }

  async function reviewCandidate(status: ReviewStatus) {
    if (!candidateRule) return
    const reviewed: ReviewedRule = {
      ...candidateRule,
      title: candidateRule.title || candidateRule.ruleId.replace(/_/g, ' '),
      reviewStatus: status,
      approvedForRuntime: status === 'approved',
      reviewedAt: new Date().toISOString(),
      reviewNotes: reviewNotes ? [reviewNotes] : candidateRule.humanReview.reviewNotes,
    }
    setReviewedRules((rules) => [reviewed, ...rules])
    await recordAuditEvent({
      eventType: status === 'approved' ? 'human.rule_approved' : status === 'rejected' ? 'human.rule_rejected' : 'human.rule_needs_revision',
      actor: 'human_reviewer',
      status: 'success',
      details: {
        ruleId: candidateRule.ruleId,
        reviewStatus: status,
        approvedForRuntime: reviewed.approvedForRuntime,
        noteLength: reviewNotes.length,
      },
    })
    await refreshAuditEvents()
  }

  function exportJson(value: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleLoadRuntimeTrace(caseId = selectedRuntimeCase) {
    setIsRuntimeBusy(true)
    setError(null)
    setTraceVerbalization(null)
    try {
      setSelectedRuntimeCase(caseId)
      setRuntimeTrace(await fetchRuntimeTrace(caseId))
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load runtime trace')
    } finally {
      setIsRuntimeBusy(false)
    }
  }

  async function handleEvaluateCustomCase() {
    setIsRuntimeBusy(true)
    setError(null)
    setTraceVerbalization(null)
    try {
      setRuntimeTrace(await evaluateRuntimeCase({ caseId: customCaseId.trim(), facts: customFactPreview }))
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to evaluate custom case')
    } finally {
      setIsRuntimeBusy(false)
    }
  }

  function applyGuidedFacts() {
    const facts = guidedFactFields
      .map((field) => factFromGuidedField(field, customCaseId.trim(), guidedFactValues))
      .filter((fact): fact is string => Boolean(fact))
    if (facts.length === 0) return

    const existing = new Set(parseFactInput(customFactsText))
    const nextFacts = [`case(${customCaseId.trim()})`, ...facts].filter((fact) => !existing.has(fact))
    if (nextFacts.length === 0) return

    setCustomFactsText((current) => `${current.trim()}\n${nextFacts.map((fact) => `${fact}.`).join('\n')}`.trim())
  }

  async function handleVerbalizeTrace() {
    if (!runtimeTrace) return
    setIsRuntimeBusy(true)
    setError(null)
    try {
      setTraceVerbalization(await verbalizeTrace({ trace: runtimeTrace.trace, sourceSnippets: runtimeTrace.sourceSnippets }))
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verbalize trace')
    } finally {
      setIsRuntimeBusy(false)
    }
  }

  async function refreshAuditEvents() {
    try {
      const result = await fetchAuditEvents(40)
      setAuditEvents(result.events)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load audit events')
    }
  }

  async function handleClearAuditEvents() {
    await clearAuditEvents()
    await refreshAuditEvents()
  }

  async function handleCompileRules() {
    setIsRuntimeBusy(true)
    setError(null)
    try {
      setCompilationResult(await compileApprovedRules())
      const result = await fetchApprovedRules()
      setApprovedRules(result.rules)
      const plans = await fetchApprovedPlans()
      setApprovedPlans(plans.plans)
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compile approved rules')
    } finally {
      setIsRuntimeBusy(false)
    }
  }

  async function handlePromoteRule(rule: ReviewedRule) {
    setIsRuntimeBusy(true)
    setError(null)
    try {
      const result = await promoteRuleToRuntime(rule)
      setCompilationResult(result.compilation)
      const approved = await fetchApprovedRules()
      setApprovedRules(approved.rules)
      const plans = await fetchApprovedPlans()
      setApprovedPlans(plans.plans)
      await refreshAuditEvents()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to promote rule to runtime'
      if (message.includes('already exists') && window.confirm(`${message}\n\nOverwrite the existing runtime artifact and recompile?`)) {
        try {
          const result = await promoteRuleToRuntime(rule, true)
          setCompilationResult(result.compilation)
          const approved = await fetchApprovedRules()
          setApprovedRules(approved.rules)
          const plans = await fetchApprovedPlans()
          setApprovedPlans(plans.plans)
          await refreshAuditEvents()
          return
        } catch (overwriteErr) {
          setError(overwriteErr instanceof Error ? overwriteErr.message : 'Unable to overwrite runtime rule')
          return
        }
      }
      setError(message)
    } finally {
      setIsRuntimeBusy(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <h1>Traceability Agent Framework</h1>
          <nav>
            <span>Rule Authoring</span>
            <span>Human Review</span>
            <span>Jason Runtime</span>
          </nav>
        </div>
      </header>

      <main className="cm-page">
        <section className="cm-hero">
          <div className="cm-hero-main">
            <div className="cm-eyebrow">Review Console</div>
            <h2 className="cm-title-xl">Choose a demo path, then inspect the trace</h2>
            <p className="cm-lead">
              Author rules from source text, run approved cardiac or GDPR benchmarks, and inspect the symbolic rules and plans Jason executes.
            </p>
          </div>
          <aside className="cm-hero-side">
            <div className="cm-status-panel">
              <div className="cm-status-label">Provider</div>
              <div className="cm-status-value">{llmStatus?.provider ?? 'checking'}</div>
              <div className="cm-status-subtitle">
                {llmStatus ? `${llmStatus.model} - ${llmStatus.configured ? 'configured' : 'missing API key'}` : 'Backend status pending'}
              </div>
            </div>
            <div className="quick-start-card">
              <strong>Current path: {activeDemo.label}</strong>
              <span>Use a source preset for LLM authoring, or load a prepared candidate for a fast review walkthrough.</span>
              <button type="button" className="cm-button secondary" onClick={() => loadPreparedCandidate(activeDemo.id)}>Load prepared candidate</button>
            </div>
          </aside>
        </section>

        <section className="demo-path-grid" aria-label="Choose demo path">
          {demoPresets.map((preset) => (
            <article key={preset.id} className={preset.id === activeDemoId ? 'demo-path-card active' : 'demo-path-card'}>
              <span className="entity-label">{preset.domainLabel}</span>
              <h2>{preset.label}</h2>
              <p>{preset.id === 'gdpr' ? 'Use GDPR Article 33 source text, then run compliance benchmark traces.' : 'Use the cardiac mass paper snippet, then run clinical benchmark traces.'}</p>
              <div className="cm-actions compact-actions">
                <button type="button" className="cm-button" onClick={() => loadSourcePreset(preset.id)}>Load source</button>
                <button type="button" className="cm-button secondary" onClick={() => loadPreparedCandidate(preset.id)}>Load prepared candidate</button>
              </div>
            </article>
          ))}
        </section>

        <div className="cm-workflow-ribbon" aria-label="Rule authoring workflow">
          <span><b>1</b> Source</span>
          <span><b>2</b> Draft</span>
          <span><b>3</b> Approve</span>
          <span><b>4</b> Promote</span>
          <span><b>5</b> Evaluate</span>
        </div>

        {error && <div className="cm-alert">{error}</div>}

        <section className="cm-layout">
          <div className="cm-stack">
            <article className="cm-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Source document</h2>
                  <p>This is the authoring path: choose a source, extract claims, draft a rule, then human-review it before runtime promotion.</p>
                </div>
              </div>

              <div className="source-preset-strip" aria-label="Source presets">
                {demoPresets.map((preset) => (
                  <button key={preset.id} type="button" className="cm-button secondary" onClick={() => loadSourcePreset(preset.id)}>
                    Load {preset.domainLabel} source
                  </button>
                ))}
              </div>

              <div className="form-grid">
                <label>
                  Source ID
                  <input value={sourceId} onChange={(event) => setSourceId(event.target.value)} />
                </label>
                <label>
                  Domain
                  <input value={domain} onChange={(event) => setDomain(event.target.value)} />
                </label>
                <label>
                  Source type
                  <select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)}>
                    <option value="paper">paper</option>
                    <option value="policy">policy</option>
                    <option value="audit">audit</option>
                    <option value="guideline">guideline</option>
                    <option value="expert_note">expert_note</option>
                  </select>
                </label>
              </div>

              <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={7} />

              <div className="cm-actions">
                <button type="button" className="cm-button" onClick={handleExtractClaims} disabled={isBusy}>Extract claims with LLM</button>
                <button type="button" className="cm-button secondary" onClick={() => loadPreparedCandidate(activeDemo.id)}>Skip LLM: load prepared candidate</button>
              </div>
              <details className="raw-json-details">
                <summary>Advanced: export source JSON</summary>
                <button type="button" className="cm-button secondary" onClick={() => exportJson({ sourceId, domain, sourceType, text: sourceText }, 'source-input.json')}>Export source JSON</button>
              </details>
            </article>

            <article className="cm-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Extracted claims</h2>
                  <p>Select the claim that should become a symbolic rule. Claims are not executable yet.</p>
                </div>
              </div>

              {claims.length === 0 ? <p className="empty-state">No claims yet.</p> : (
                <div className="claim-list">
                  {claims.map((claim) => (
                    <button
                      type="button"
                      key={claim.claimId}
                      className={claim.claimId === selectedClaim?.claimId ? 'claim-card active' : 'claim-card'}
                      onClick={() => setSelectedClaimId(claim.claimId)}
                    >
                      <strong>{claim.claimId}</strong>
                      <span>{claim.candidateMeaning}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="cm-actions">
                <button type="button" className="cm-button" onClick={handleDraftRule} disabled={isBusy || !selectedClaim}>Draft candidate rule</button>
              </div>
              {claims.length > 0 && (
                <details className="raw-json-details">
                  <summary>Advanced: export claims JSON</summary>
                  <button type="button" className="cm-button secondary" onClick={() => exportJson({ sourceId, claims }, 'extracted-claims.json')}>Export claims</button>
                </details>
              )}
            </article>

            <article className="cm-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Candidate rule</h2>
                  <p>Review what the rule requires, what it produces, and whether every predicate is understandable.</p>
                </div>
                {candidateRule && <span className="state-pill draft">draft</span>}
              </div>

              {candidateRule ? (
                <>
                  <RuleEntityCards rule={candidateRule} />

                  <section className="inline-review-panel" aria-label="Human review for current candidate rule">
                    <div className="cm-card-title">
                      <h2>Review this rule</h2>
                      <p>Approval makes the rule eligible for runtime promotion. It still will not run until promoted.</p>
                    </div>
                    <textarea placeholder="Review notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={4} />
                    <div className="cm-actions">
                      <button type="button" className="cm-button" onClick={() => reviewCandidate('approved')}>Approve this rule</button>
                      <button type="button" className="cm-button secondary" onClick={() => reviewCandidate('needs_revision')}>Needs revision</button>
                      <button type="button" className="cm-button danger" onClick={() => reviewCandidate('rejected')}>Reject this rule</button>
                    </div>
                  </section>

                  <details className="raw-json-details">
                    <summary>Inspect raw candidate rule JSON</summary>
                    <pre className="json-panel">{JSON.stringify(candidateRule, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="empty-state">No candidate rule yet.</p>
              )}
            </article>

            <article className="cm-card runtime-demo-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Runtime evaluation</h2>
                  <p>Run already-approved rules and plans. Use benchmark cards for the prepared cardiac/GDPR traces, or edit facts for a live custom Jason run.</p>
                </div>
              </div>

              <StepHint>Recommended demo: choose a benchmark card. The trace shows activated rules, activated plans, evidence, sources, and next steps.</StepHint>

              <section className="benchmark-panel" aria-label="Runtime benchmark cases">
                <div className="benchmark-panel-header">
                  <div>
                    <span className="entity-label">Benchmark cases</span>
                    <h3>{activeDemo.domainLabel}</h3>
                  </div>
                  <div className="cm-actions compact-actions">
                    {demoPresets.map((preset) => (
                      <button key={preset.id} type="button" className={preset.id === activeDemoId ? 'cm-button' : 'cm-button secondary'} onClick={() => loadSourcePreset(preset.id)}>
                        {preset.domainLabel}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="benchmark-case-grid">
                  {activeDemoRuntimeCases.map((runtimeCase) => (
                    <button key={runtimeCase.caseId} type="button" className={runtimeCase.caseId === selectedRuntimeCase ? 'benchmark-case-card active' : 'benchmark-case-card'} onClick={() => handleLoadRuntimeTrace(runtimeCase.caseId)} disabled={isRuntimeBusy}>
                      <strong>{runtimeCase.label}</strong>
                      <span>{runtimeCase.caseId.startsWith('gdpr') ? 'GDPR rules + approved compliance plan' : 'Cardiac rules + MAS planning baseline'}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="custom-case-panel" aria-label="Custom case fact evaluation">
                <div className="cm-card-title">
                  <h2>Custom case facts</h2>
                  <p>These facts are domain-agnostic AgentSpeak inputs. Jason evaluates them using approved rules only.</p>
                </div>
                <div className="form-grid custom-case-grid">
                  <label>
                    Case ID
                    <input value={customCaseId} onChange={(event) => setCustomCaseId(event.target.value)} />
                  </label>
                </div>
                <div className="cm-actions primary-runtime-action">
                  <button type="button" className="cm-button" onClick={handleEvaluateCustomCase} disabled={isRuntimeBusy}>Evaluate case with Jason</button>
                </div>
                {guidedFactFields.length > 0 && (
                  <details className="guided-fact-builder" aria-label="Guided fact builder">
                    <summary>Optional: build facts from approved predicates</summary>
                    <span className="entity-label">Guided facts from approved predicates</span>
                    <div className="guided-fact-grid">
                      {guidedFactFields.map((field) => (
                        <section key={field.key} className="guided-fact-field">
                          <strong>{field.label}</strong>
                          <code>{field.predicate}/{field.args.length}</code>
                          {field.inputIndexes.length === 0 ? (
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={guidedFactValues[field.key] === 'true'}
                                onChange={(event) => setGuidedFactValues((values) => ({ ...values, [field.key]: event.target.checked ? 'true' : 'false' }))}
                              />
                              Include this fact
                            </label>
                          ) : (
                            field.inputIndexes.map((index) => (
                              <label key={`${field.key}-${index}`}>
                                {labelAtom(field.args[index])}
                                <input
                                  value={guidedFactValues[`${field.key}:${index}`] ?? ''}
                                  onChange={(event) => setGuidedFactValues((values) => ({ ...values, [`${field.key}:${index}`]: event.target.value }))}
                                  placeholder={field.args[index]}
                                />
                              </label>
                            ))
                          )}
                        </section>
                      ))}
                    </div>
                    <div className="cm-actions compact-actions">
                      <button type="button" className="cm-button secondary" onClick={applyGuidedFacts}>Add guided facts to editor</button>
                    </div>
                  </details>
                )}
                <details className="raw-json-details" open>
                  <summary>Edit raw facts</summary>
                  <textarea value={customFactsText} onChange={(event) => setCustomFactsText(event.target.value)} rows={7} />
                </details>
                {customFactPreview.length > 0 && (
                  <details className="raw-json-details">
                    <summary>Preview parsed facts and predicate mappings</summary>
                    <LogicFragmentList items={customFactPreview} />
                  </details>
                )}
                <details className="raw-json-details">
                  <summary>Advanced: export case input</summary>
                  <button type="button" className="cm-button secondary" onClick={() => exportJson({ caseId: customCaseId, facts: customFactPreview }, `${customCaseId || 'custom-case'}.input.json`)}>Export case input</button>
                </details>
              </section>

              <details className="raw-json-details">
                <summary>All golden cases</summary>
                <div className="runtime-controls">
                  <label>
                    Golden case
                    <select value={selectedRuntimeCase} onChange={(event) => setSelectedRuntimeCase(event.target.value)}>
                      {runtimeCases.map((runtimeCase) => <option key={runtimeCase.caseId} value={runtimeCase.caseId}>{runtimeCase.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className="cm-button secondary" onClick={() => handleLoadRuntimeTrace()} disabled={isRuntimeBusy}>Load golden trace</button>
                </div>
              </details>

              {runtimeTrace && (
                <>
                  <div className="runtime-summary">
                    <section>
                      <span className="entity-label">Case</span>
                      <h3>{runtimeTrace.trace.caseId}</h3>
                      <p>{runtimeTrace.note}</p>
                      {runtimeTrace.tracePath && <p>Trace: <code>{runtimeTrace.tracePath}</code></p>}
                    </section>
                    <section>
                      <span className="entity-label">Decision</span>
                      <h3>{runtimeTrace.trace.decision}</h3>
                      <p>Risk: <strong>{runtimeTrace.trace.risk}</strong></p>
                    </section>
                  </div>

                  <div className="trace-grid">
                    <TraceList title="Activated rules" items={runtimeTrace.trace.activatedRules} humanize={humanizeRuleId} />
                    <TraceList title="Activated plans" items={runtimeTrace.trace.activatedPlans} humanize={humanizePlanId} />
                    <TraceList title="Used evidence" items={runtimeTrace.trace.usedEvidence} humanize={humanizeFact} />
                    <TraceList title="Missing data" items={runtimeTrace.trace.missingData} humanize={humanizeMissingData} />
                    <TraceList title="Next steps" items={runtimeTrace.trace.nextSteps} humanize={humanizeNextStep} />
                    <TraceList title="Human review" items={runtimeTrace.trace.humanReview} humanize={humanizeReviewReason} />
                    <section className="trace-list-card">
                      <span className="entity-label">Source snippets</span>
                      <ul className="source-snippet-list">
                        {runtimeTrace.sourceSnippets.map((source) => (
                          <li key={source.sourceId}>
                            <strong>{source.sourceId}</strong>
                            <span>{source.snippet}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <section className="activated-approved-rules">
                    <div className="cm-card-title">
                      <h2>Approved rules activated by this trace</h2>
                      <p>These runtime-approved artifacts match the trace's activated rule identifiers.</p>
                    </div>
                    {activeApprovedRules.length === 0 ? (
                      <p className="empty-state">No approved rule artifact matched this trace.</p>
                    ) : (
                      <div className="approved-rule-grid compact">
                        {activeApprovedRules.map((rule) => <ApprovedRuleCard key={rule.ruleId} rule={rule} active />)}
                      </div>
                    )}
                  </section>

                  <section className="activated-approved-rules">
                    <div className="cm-card-title">
                      <h2>Approved plans activated by this trace</h2>
                      <p>Plans explain where the next steps come from after a symbolic decision.</p>
                    </div>
                    {activeApprovedPlans.length === 0 ? (
                      <p className="empty-state">No approved plan artifact matched this trace.</p>
                    ) : (
                      <div className="approved-rule-grid compact">
                        {activeApprovedPlans.map((plan) => <ApprovedPlanCard key={plan.planId} plan={plan} active />)}
                      </div>
                    )}
                  </section>

                  <div className="cm-actions">
                    <button type="button" className="cm-button" onClick={handleVerbalizeTrace} disabled={isRuntimeBusy}>Verbalize trace with LLM</button>
                    <details className="inline-details">
                      <summary>Export</summary>
                      <button type="button" className="cm-button secondary" onClick={() => exportJson(runtimeTrace.trace, `${runtimeTrace.trace.caseId}.trace.json`)}>Export trace JSON</button>
                    </details>
                  </div>
                </>
              )}

              {traceVerbalization && (
                <section className="verbalization-card">
                  <span className="entity-label">Constrained explanation</span>
                  <p>{traceVerbalization.answer}</p>
                  <div className="verbalization-meta">
                    <strong>Used sources:</strong> {traceVerbalization.usedSources.join(', ') || 'none'}
                  </div>
                  {traceVerbalization.limitations.length > 0 && (
                    <ul className="limitation-list">
                      {traceVerbalization.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                    </ul>
                  )}
                </section>
              )}
            </article>
          </div>

          <aside className="cm-sidebar">
            <article className="cm-card">
              <div className="cm-card-title">
                <h2>Approved knowledge base</h2>
                <p>{approvedRules.length} rules and {approvedPlans.length} plans loaded. Runtime uses only approved symbolic artifacts.</p>
              </div>
              <details className="raw-json-details">
                <summary>Advanced runtime tools</summary>
                <div className="cm-actions compact-actions">
                  <button type="button" className="cm-button secondary" onClick={handleCompileRules} disabled={isRuntimeBusy || approvedRules.length === 0}>Regenerate AgentSpeak</button>
                </div>
              </details>
              {compilationResult && (
                <details className="raw-json-details" open>
                  <summary>Compilation output</summary>
                  <p>Generated: {compilationResult.generatedFiles.join(', ')}</p>
                  <pre className="json-panel">{compilationResult.stdout || 'Compilation completed.'}</pre>
                  {compilationResult.stderr && <pre className="json-panel">{compilationResult.stderr}</pre>}
                </details>
              )}
              <div className="knowledge-domain-list">
                {Object.entries(rulesByDomain).map(([domainName, rules]) => (
                  <section key={domainName} className="knowledge-domain-card">
                    <h3>{domainName}</h3>
                    <span>{rules.length} approved rules</span>
                    <div className="approved-rule-grid sidebar-rules">
                      {rules.map((rule) => (
                        <ApprovedRuleCard
                          key={rule.ruleId}
                          rule={rule}
                          active={runtimeTrace?.trace.activatedRules.includes(rule.ruleId) ?? false}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                {Object.entries(plansByDomain).map(([domainName, plans]) => (
                  <section key={`${domainName}-plans`} className="knowledge-domain-card plan-domain-card">
                    <h3>{domainName} plans</h3>
                    <span>{plans.length} approved plans</span>
                    <div className="approved-rule-grid sidebar-rules">
                      {plans.map((plan) => (
                        <ApprovedPlanCard
                          key={plan.planId}
                          plan={plan}
                          active={runtimeTrace?.trace.activatedPlans.includes(plan.planId) ?? false}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>

            <article className="cm-card">
              <div className="cm-card-title">
                <h2>Reviewed rules</h2>
                <p>{reviewedRules.length} reviewed artifacts in this session.</p>
              </div>
              <div className="reviewed-list">
                {reviewedRules.map((rule) => (
                  <section key={`${rule.ruleId}-${rule.reviewedAt}`} className="reviewed-rule">
                    <span className={`state-pill ${rule.reviewStatus}`}>{rule.reviewStatus}</span>
                    <strong>{rule.ruleId}</strong>
                    <small>{rule.approvedForRuntime ? 'Runtime eligible' : 'Not runtime eligible'}</small>
                    <div className="reviewed-rule-actions">
                      <button type="button" className="cm-button secondary" onClick={() => exportJson(rule, `${rule.ruleId}.${rule.reviewStatus}.json`)}>Export JSON</button>
                      <button type="button" className="cm-button" onClick={() => handlePromoteRule(rule)} disabled={isRuntimeBusy || !rule.approvedForRuntime || rule.reviewStatus !== 'approved'}>Promote to runtime</button>
                    </div>
                  </section>
                ))}
              </div>
            </article>

            <AuditTrail events={auditEvents} onRefresh={refreshAuditEvents} onClear={handleClearAuditEvents} />

            <article className="cm-card cm-disclaimer">
              <strong>Safety boundary</strong><br />
              The LLM drafts rule candidates. It does not approve rules, execute cases, or decide outcomes. Runtime reasoning must use approved symbolic rules only.
            </article>
          </aside>
        </section>
      </main>
    </>
  )
}
