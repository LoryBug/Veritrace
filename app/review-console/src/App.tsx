import { useEffect, useState } from 'react'
import { clearAuditEvents, compileApprovedRules, draftRule, extractClaims, fetchApprovedRules, fetchAuditEvents, fetchHealth, fetchRuntimeCases, fetchRuntimeTrace, recordAuditEvent, verbalizeTrace } from './api'
import { humanizeFact, humanizeMissingData, humanizeMissingDataBehavior, humanizeNextStep, humanizeReviewReason, humanizeRuleId } from './humanize'
import { sampleCandidateRule, sampleClaims, sampleSource } from './sample-data'
import type { ApprovedRuntimeRule, AuditEvent, CandidateRule, Claim, LlmStatus, ReviewedRule, RuntimeCase, RuntimeTraceResponse, SourceType, TraceVerbalization } from './types'

type ReviewStatus = ReviewedRule['reviewStatus']

const canonicalConcepts = [
  'case(Case)',
  'score(Case, Metric, Value)',
  'cutoff(Metric, Cutoff)',
  'risk(Case, Level)',
  'decision(Case, Decision)',
  'activated_rule(Case, RuleId)',
  'requires_human_review(Case, Reason)',
]

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
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">Source grounding</span>
        <h3>{rule.source.sourceId}</h3>
        <blockquote>{rule.source.quote}</blockquote>
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">When this rule applies</span>
        <h3>Conditions</h3>
        <ul className="entity-list domain-list">
          {rule.conditions.map((condition) => (
            <li key={condition}>
              <span>{humanizeFact(condition)}</span>
              <code>{condition}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">What the rule produces</span>
        <h3>Conclusions</h3>
        <ul className="entity-list conclusions domain-list">
          {rule.conclusions.map((conclusion) => (
            <li key={conclusion}>
              <span>{humanizeFact(conclusion)}</span>
              <code>{conclusion}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="rule-entity-card">
        <span className="entity-label">Safety behavior</span>
        <h3>Missing data</h3>
        <p>{humanizeMissingDataBehavior(rule.missingDataBehavior)}</p>
      </section>

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
      <p>Runtime: {rule.runtimeImplementation.activatedRuleFact}</p>
      {rule.artifactPath && <small>{rule.artifactPath}</small>}
    </article>
  )
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
  const [selectedRuntimeCase, setSelectedRuntimeCase] = useState('gc04')
  const [runtimeTrace, setRuntimeTrace] = useState<RuntimeTraceResponse | null>(null)
  const [traceVerbalization, setTraceVerbalization] = useState<TraceVerbalization | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [compilationResult, setCompilationResult] = useState<{ generatedFiles: string[]; stdout: string; stderr: string } | null>(null)
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
    refreshAuditEvents()
  }, [])

  const selectedClaim = claims.find((claim) => claim.claimId === selectedClaimId) ?? claims[0]
  const activeApprovedRules = runtimeTrace
    ? approvedRules.filter((rule) => runtimeTrace.trace.activatedRules.includes(rule.ruleId))
    : []

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

  function loadSampleOutputs() {
    setClaims(sampleClaims)
    setSelectedClaimId(sampleClaims[0].claimId)
    setCandidateRule(sampleCandidateRule)
    setError(null)
  }

  async function reviewCandidate(status: ReviewStatus) {
    if (!candidateRule) return
    const reviewed: ReviewedRule = {
      ...candidateRule,
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

  async function handleLoadRuntimeTrace() {
    setIsRuntimeBusy(true)
    setError(null)
    setTraceVerbalization(null)
    try {
      setRuntimeTrace(await fetchRuntimeTrace(selectedRuntimeCase))
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load runtime trace')
    } finally {
      setIsRuntimeBusy(false)
    }
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
      await refreshAuditEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compile approved rules')
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
            <h2 className="cm-title-xl">Document to approved symbolic rules</h2>
            <p className="cm-lead">
              LLMs draft claims and rules. Humans approve them. Jason executes only approved rules and produces auditable traces.
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
            <button type="button" className="cm-button secondary" onClick={loadSampleOutputs}>Load sample outputs</button>
          </aside>
        </section>

        <div className="cm-workflow-ribbon" aria-label="Rule authoring workflow">
          <span><b>1</b> Source</span>
          <span><b>2</b> Claims</span>
          <span><b>3</b> Draft Rule</span>
          <span><b>4</b> Human Review</span>
          <span><b>5</b> Export</span>
        </div>

        {error && <div className="cm-alert">{error}</div>}

        <section className="cm-layout">
          <div className="cm-stack">
            <article className="cm-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Source document</h2>
                  <p>Paste a curated paper, policy, audit, guideline, or expert note snippet.</p>
                </div>
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
                <button type="button" className="cm-button secondary" onClick={() => exportJson({ sourceId, domain, sourceType, text: sourceText }, 'source-input.json')}>Export source JSON</button>
              </div>
            </article>

            <article className="cm-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Extracted claims</h2>
                  <p>Claims are not executable rules. They require review and rule drafting.</p>
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
                <button type="button" className="cm-button secondary" onClick={() => exportJson({ sourceId, claims }, 'extracted-claims.json')} disabled={claims.length === 0}>Export claims</button>
              </div>
            </article>

            <article className="cm-card">
              <div className="cm-card-header">
                <div className="cm-card-title">
                  <h2>Candidate rule</h2>
                  <p>Readable rule cards for domain review. The raw JSON remains available for audit.</p>
                </div>
                {candidateRule && <span className="state-pill draft">draft</span>}
              </div>

              {candidateRule ? (
                <>
                  <RuleEntityCards rule={candidateRule} />

                  <section className="inline-review-panel" aria-label="Human review for current candidate rule">
                    <div className="cm-card-title">
                      <h2>Review this rule</h2>
                      <p>These actions apply only to the candidate rule shown above.</p>
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
                  <h2>Runtime trace demo</h2>
                  <p>Select a golden case, load its structured trace, then verbalize it with the constrained LLM.</p>
                </div>
              </div>

              <div className="runtime-controls">
                <label>
                  Golden case
                  <select value={selectedRuntimeCase} onChange={(event) => setSelectedRuntimeCase(event.target.value)}>
                    {runtimeCases.map((runtimeCase) => <option key={runtimeCase.caseId} value={runtimeCase.caseId}>{runtimeCase.label}</option>)}
                  </select>
                </label>
                <button type="button" className="cm-button" onClick={handleLoadRuntimeTrace} disabled={isRuntimeBusy}>Load trace</button>
              </div>

              {runtimeTrace && (
                <>
                  <div className="runtime-summary">
                    <section>
                      <span className="entity-label">Case</span>
                      <h3>{runtimeTrace.trace.caseId}</h3>
                      <p>{runtimeTrace.note}</p>
                    </section>
                    <section>
                      <span className="entity-label">Decision</span>
                      <h3>{runtimeTrace.trace.decision}</h3>
                      <p>Risk: <strong>{runtimeTrace.trace.risk}</strong></p>
                    </section>
                  </div>

                  <div className="trace-grid">
                    <TraceList title="Activated rules" items={runtimeTrace.trace.activatedRules} humanize={humanizeRuleId} />
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

                  <div className="cm-actions">
                    <button type="button" className="cm-button" onClick={handleVerbalizeTrace} disabled={isRuntimeBusy}>Verbalize trace with LLM</button>
                    <button type="button" className="cm-button secondary" onClick={() => exportJson(runtimeTrace.trace, `${runtimeTrace.trace.caseId}.trace.json`)}>Export trace JSON</button>
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
                <h2>Approved runtime rules</h2>
                <p>{approvedRules.length} approved artifacts loaded from `approved/rules`.</p>
              </div>
              <div className="cm-actions compact-actions">
                <button type="button" className="cm-button" onClick={handleCompileRules} disabled={isRuntimeBusy || approvedRules.length === 0}>Generate AgentSpeak</button>
              </div>
              {compilationResult && (
                <details className="raw-json-details" open>
                  <summary>Compilation output</summary>
                  <p>Generated: {compilationResult.generatedFiles.join(', ')}</p>
                  <pre className="json-panel">{compilationResult.stdout || 'Compilation completed.'}</pre>
                  {compilationResult.stderr && <pre className="json-panel">{compilationResult.stderr}</pre>}
                </details>
              )}
              <div className="approved-rule-grid sidebar-rules">
                {approvedRules.map((rule) => (
                  <ApprovedRuleCard
                    key={rule.ruleId}
                    rule={rule}
                    active={runtimeTrace?.trace.activatedRules.includes(rule.ruleId) ?? false}
                  />
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
                  <button key={`${rule.ruleId}-${rule.reviewedAt}`} type="button" className="reviewed-rule" onClick={() => exportJson(rule, `${rule.ruleId}.${rule.reviewStatus}.json`)}>
                    <span className={`state-pill ${rule.reviewStatus}`}>{rule.reviewStatus}</span>
                    <strong>{rule.ruleId}</strong>
                    <small>{rule.approvedForRuntime ? 'Runtime eligible' : 'Not runtime eligible'}</small>
                  </button>
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
