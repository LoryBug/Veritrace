import cors from 'cors'
import { execFile } from 'node:child_process'
import dotenv from 'dotenv'
import express from 'express'
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { z } from 'zod'
import { clearAuditEvents, readAuditEvents, recordAuditEvent } from './audit.js'
import { completeJson, publicLlmStatus } from './llm.js'
import { claimExtractionPrompt, ruleDraftingPrompt, traceVerbalizationPrompt } from './prompts.js'
import { ApprovedRuleSchema, CandidateRuleSchema, ClaimsResponseSchema, DraftRuleInputSchema, PromoteRuleInputSchema, RuntimeCaseFactInputSchema, SourceInputSchema, TraceSchema, TraceVerbalizationInputSchema, TraceVerbalizationOutputSchema } from './schemas.js'
import { loadApprovedRules } from './approved-rules.js'
import { loadApprovedPlans } from './approved-plans.js'
import { loadRuntimeTrace, runtimeCases, sourceSnippetsFor } from './runtime-demo.js'

dotenv.config()

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(process.cwd(), '../..')
const approvedRulesDir = path.join(repoRoot, 'approved/rules')
const app = express()
const host = process.env.API_HOST || '127.0.0.1'
const port = Number(process.env.PORT || 8787)

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, llm: publicLlmStatus() })
})

app.get('/api/audit-events', async (request, response) => {
  const limit = Number(request.query.limit || 50)
  response.json({ events: await readAuditEvents(limit) })
})

app.post('/api/audit-events', async (request, response) => {
  try {
    const event = await recordAuditEvent({
      eventType: String(request.body.eventType || 'client.event'),
      actor: request.body.actor || 'system',
      status: request.body.status || 'success',
      details: request.body.details || {},
    })
    response.json({ event })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to record audit event' })
  }
})

app.delete('/api/audit-events', async (_request, response) => {
  await clearAuditEvents()
  response.json({ ok: true })
})

app.post('/api/extract-claims', async (request, response) => {
  const startedAt = Date.now()
  try {
    const input = SourceInputSchema.parse(request.body)
    await recordAuditEvent({
      eventType: 'llm.claim_extraction.started',
      actor: 'llm',
      status: 'started',
      details: {
        sourceId: input.sourceId,
        domain: input.domain,
        sourceType: input.sourceType,
        inputLength: input.text.length,
        ...publicLlmStatus(),
      },
    })
    const raw = await completeJson(claimExtractionPrompt(JSON.stringify(input, null, 2)))
    const parsed = ClaimsResponseSchema.parse(raw)
    await recordAuditEvent({
      eventType: 'llm.claim_extraction.completed',
      actor: 'llm',
      status: 'success',
      details: {
        sourceId: input.sourceId,
        claimCount: parsed.claims.length,
        elapsedMs: Date.now() - startedAt,
        ...publicLlmStatus(),
      },
    })
    response.json(parsed)
  } catch (error) {
    await recordAuditEvent({
      eventType: 'llm.claim_extraction.failed',
      actor: 'llm',
      status: 'failure',
      details: {
        error: error instanceof Error ? error.message : 'Unknown extraction error',
        elapsedMs: Date.now() - startedAt,
        ...publicLlmStatus(),
      },
    })
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unknown extraction error' })
  }
})

app.post('/api/draft-rule', async (request, response) => {
  const startedAt = Date.now()
  try {
    const input = DraftRuleInputSchema.parse(request.body)
    await recordAuditEvent({
      eventType: 'llm.rule_drafting.started',
      actor: 'llm',
      status: 'started',
      details: {
        claimId: input.claim.claimId,
        sourceId: input.claim.sourceId,
        domain: input.domain,
        ...publicLlmStatus(),
      },
    })
    const raw = await completeJson(ruleDraftingPrompt(JSON.stringify(input, null, 2)))
    const candidate = findCandidateRuleObject(raw)
    const parsedResult = CandidateRuleSchema.safeParse(candidate)
    if (!parsedResult.success) {
      throw new Error(formatCandidateRuleError(parsedResult.error.issues, raw))
    }
    const parsed = parsedResult.data
    await recordAuditEvent({
      eventType: 'llm.rule_drafting.completed',
      actor: 'llm',
      status: 'success',
      details: {
        claimId: input.claim.claimId,
        ruleId: parsed.ruleId,
        reviewStatus: parsed.reviewStatus,
        approvedForRuntime: parsed.approvedForRuntime,
        elapsedMs: Date.now() - startedAt,
        ...publicLlmStatus(),
      },
    })
    response.json(parsed)
  } catch (error) {
    await recordAuditEvent({
      eventType: 'llm.rule_drafting.failed',
      actor: 'llm',
      status: 'failure',
      details: {
        error: error instanceof Error ? error.message : 'Unknown rule drafting error',
        elapsedMs: Date.now() - startedAt,
        ...publicLlmStatus(),
      },
    })
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unknown rule drafting error' })
  }
})

app.get('/api/runtime/cases', (_request, response) => {
  response.json({ cases: runtimeCases })
})

app.get('/api/approved-rules', async (_request, response) => {
  try {
    const rules = await loadApprovedRules()
    await recordAuditEvent({
      eventType: 'runtime.approved_rules_loaded',
      actor: 'runtime_demo',
      status: 'success',
      details: {
        ruleCount: rules.length,
        ruleIds: rules.map((rule) => rule.ruleId),
      },
    })
    response.json({ rules })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load approved rules' })
  }
})

app.post('/api/compile-rules', async (_request, response) => {
  const startedAt = Date.now()
  try {
    await recordAuditEvent({
      eventType: 'runtime.rules_compilation.started',
      actor: 'system',
      status: 'started',
      details: {},
    })

    const compileRulesScript = path.join(repoRoot, 'tools/mas/compile-rules.mjs')
    const compilePlansScript = path.join(repoRoot, 'tools/mas/compile-plans.mjs')
    const validateScript = path.join(repoRoot, 'tools/mas/validate-compilation.mjs')
    const compileRules = await execFileAsync(process.execPath, [compileRulesScript], { cwd: repoRoot })
    const compilePlans = await execFileAsync(process.execPath, [compilePlansScript], { cwd: repoRoot })
    const validate = await execFileAsync(process.execPath, [validateScript], { cwd: repoRoot })

    const result = {
      generatedFiles: [
        'agents/case_reasoner_generated.asl',
        'agents/care_planner_generated.asl',
        'beliefs/approved_rules.asl',
        'beliefs/approved_rule_sources.asl',
        'beliefs/approved_plans.asl',
      ],
      stdout: `${compileRules.stdout}${compilePlans.stdout}${validate.stdout}`.trim(),
      stderr: `${compileRules.stderr}${compilePlans.stderr}${validate.stderr}`.trim(),
    }

    await recordAuditEvent({
      eventType: 'runtime.rules_compilation.completed',
      actor: 'system',
      status: 'success',
      details: {
        elapsedMs: Date.now() - startedAt,
        generatedFiles: result.generatedFiles,
      },
    })

    response.json(result)
  } catch (error) {
    await recordAuditEvent({
      eventType: 'runtime.rules_compilation.failed',
      actor: 'system',
      status: 'failure',
      details: {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown compilation error',
      },
    })
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to compile approved rules' })
  }
})

app.get('/api/approved-plans', async (_request, response) => {
  try {
    const plans = await loadApprovedPlans()
    await recordAuditEvent({
      eventType: 'runtime.approved_plans_loaded',
      actor: 'runtime_demo',
      status: 'success',
      details: {
        planCount: plans.length,
        planIds: plans.map((plan) => plan.planId),
      },
    })
    response.json({ plans })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load approved plans' })
  }
})

app.post('/api/runtime/promote-rule', async (request, response) => {
  const startedAt = Date.now()
  let artifactPath = ''
  let previousArtifact: string | null = null
  try {
    const input = PromoteRuleInputSchema.parse(request.body)
    const artifact = ApprovedRuleSchema.parse(toApprovedRuntimeArtifact(input.rule))
    artifactPath = path.join(approvedRulesDir, `${artifact.ruleId}.json`)
    const artifactExists = await exists(artifactPath)
    if (artifactExists && !input.overwrite) {
      response.status(409).json({ error: `Approved rule artifact already exists: approved/rules/${artifact.ruleId}.json` })
      return
    }

    await recordAuditEvent({
      eventType: 'runtime.rule_promotion.started',
      actor: 'human_reviewer',
      status: 'started',
      details: {
        ruleId: artifact.ruleId,
        overwrite: input.overwrite,
      },
    })

    previousArtifact = artifactExists ? await readFile(artifactPath, 'utf8') : null
    await mkdir(approvedRulesDir, { recursive: true })
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')

    const compilation = await compileAndValidateRules()
    await recordAuditEvent({
      eventType: 'runtime.rule_promotion.completed',
      actor: 'human_reviewer',
      status: 'success',
      details: {
        ruleId: artifact.ruleId,
        artifactPath: `approved/rules/${artifact.ruleId}.json`,
        elapsedMs: Date.now() - startedAt,
      },
    })

    response.json({
      rule: { ...artifact, artifactPath: `approved/rules/${artifact.ruleId}.json` },
      artifactPath: `approved/rules/${artifact.ruleId}.json`,
      compilation,
    })
  } catch (error) {
    if (artifactPath) await restoreArtifact(artifactPath, previousArtifact)
    await recordAuditEvent({
      eventType: 'runtime.rule_promotion.failed',
      actor: 'human_reviewer',
      status: 'failure',
      details: {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown rule promotion error',
      },
    })
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to promote rule' })
  }
})

app.get('/api/runtime/trace/:caseId', async (request, response) => {
  try {
    const runtimeTrace = await loadRuntimeTrace(request.params.caseId)
    await recordAuditEvent({
      eventType: 'runtime.trace_loaded',
      actor: 'runtime_demo',
      status: 'success',
      details: {
        caseId: runtimeTrace.trace.caseId,
        decision: runtimeTrace.trace.decision,
        risk: runtimeTrace.trace.risk,
        activatedRules: runtimeTrace.trace.activatedRules,
      },
    })
    for (const ruleId of runtimeTrace.trace.activatedRules) {
      await recordAuditEvent({
        eventType: 'runtime.approved_rule_activated',
        actor: 'runtime_demo',
        status: 'success',
        details: {
          caseId: runtimeTrace.trace.caseId,
          ruleId,
        },
      })
    }
    response.json(runtimeTrace)
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Unknown runtime trace error' })
  }
})

app.post('/api/runtime/evaluate-case', async (request, response) => {
  const startedAt = Date.now()
  try {
    const input = RuntimeCaseFactInputSchema.parse(request.body)
    await recordAuditEvent({
      eventType: 'runtime.custom_case_evaluation.started',
      actor: 'runtime_demo',
      status: 'started',
      details: {
        caseId: input.caseId,
        factCount: input.facts.length,
      },
    })

    const runtimeDir = path.join(repoRoot, 'output/runtime', input.caseId)
    const inputPath = path.join(runtimeDir, 'input.json')
    await mkdir(runtimeDir, { recursive: true })
    await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8')

    const evaluateScript = path.join(repoRoot, 'tools/mas/evaluate-case.mjs')
    const run = await execFileAsync(process.execPath, [evaluateScript, inputPath], {
      cwd: repoRoot,
      timeout: 90000,
      maxBuffer: 1024 * 1024 * 10,
    })
    const raw = JSON.parse(run.stdout)
    const trace = TraceSchema.parse(raw.trace)
    const result = {
      mode: 'jason_live_case',
      note: 'This trace was produced by running the Jason MAS with user-provided AgentSpeak facts.',
      case: {
        caseId: input.caseId,
        label: `Custom case: ${input.caseId}`,
        expectedTracePath: raw.tracePath,
      },
      inputFacts: raw.inputFacts as string[],
      trace,
      sourceSnippets: sourceSnippetsFor(trace.sources),
      outputDir: raw.outputDir as string,
      tracePath: raw.tracePath as string,
    }

    await recordAuditEvent({
      eventType: 'runtime.custom_case_evaluation.completed',
      actor: 'runtime_demo',
      status: 'success',
      details: {
        caseId: trace.caseId,
        decision: trace.decision,
        risk: trace.risk,
        activatedRules: trace.activatedRules,
        elapsedMs: Date.now() - startedAt,
      },
    })

    response.json(result)
  } catch (error) {
    await recordAuditEvent({
      eventType: 'runtime.custom_case_evaluation.failed',
      actor: 'runtime_demo',
      status: 'failure',
      details: {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown custom case evaluation error',
      },
    })
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to evaluate custom case' })
  }
})

app.post('/api/verbalize-trace', async (request, response) => {
  const startedAt = Date.now()
  try {
    const input = TraceVerbalizationInputSchema.parse(request.body)
    await recordAuditEvent({
      eventType: 'llm.trace_verbalization.started',
      actor: 'llm',
      status: 'started',
      details: {
        caseId: input.trace.caseId,
        sourceCount: input.sourceSnippets.length,
        ...publicLlmStatus(),
      },
    })
    const raw = await completeJson(traceVerbalizationPrompt(JSON.stringify(input, null, 2)))
    const parsed = TraceVerbalizationOutputSchema.parse(raw)
    await recordAuditEvent({
      eventType: 'llm.trace_verbalization.completed',
      actor: 'llm',
      status: 'success',
      details: {
        caseId: parsed.caseId,
        usedSources: parsed.usedSources,
        limitationCount: parsed.limitations.length,
        elapsedMs: Date.now() - startedAt,
        ...publicLlmStatus(),
      },
    })
    response.json(parsed)
  } catch (error) {
    await recordAuditEvent({
      eventType: 'llm.trace_verbalization.failed',
      actor: 'llm',
      status: 'failure',
      details: {
        error: error instanceof Error ? error.message : 'Unknown trace verbalization error',
        elapsedMs: Date.now() - startedAt,
        ...publicLlmStatus(),
      },
    })
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unknown trace verbalization error' })
  }
})

async function compileAndValidateRules() {
  const compileRulesScript = path.join(repoRoot, 'tools/mas/compile-rules.mjs')
  const compilePlansScript = path.join(repoRoot, 'tools/mas/compile-plans.mjs')
  const validateScript = path.join(repoRoot, 'tools/mas/validate-compilation.mjs')
  const compileRules = await execFileAsync(process.execPath, [compileRulesScript], { cwd: repoRoot })
  const compilePlans = await execFileAsync(process.execPath, [compilePlansScript], { cwd: repoRoot })
  const validate = await execFileAsync(process.execPath, [validateScript], { cwd: repoRoot })

  return {
    generatedFiles: [
      'agents/case_reasoner_generated.asl',
      'agents/care_planner_generated.asl',
      'beliefs/approved_rules.asl',
      'beliefs/approved_rule_sources.asl',
      'beliefs/approved_plans.asl',
    ],
    stdout: `${compileRules.stdout}${compilePlans.stdout}${validate.stdout}`.trim(),
    stderr: `${compileRules.stderr}${compilePlans.stderr}${validate.stderr}`.trim(),
  }
}

function toApprovedRuntimeArtifact(rule: z.infer<typeof PromoteRuleInputSchema>['rule']) {
  return {
    ...rule,
    runtimeImplementation: {
      agentFile: 'agents/case_reasoner.asl',
      activatedRuleFact: `activated_rule(Case, ${rule.ruleId})`,
      sourceMappingFact: `source_for_rule(${rule.ruleId}, ${rule.source.sourceId})`,
    },
    usedEvidence: [],
    validatedBy: [],
    limitations: rule.reviewNotes.length > 0 ? rule.reviewNotes : ['Promoted from human review console; external validation is not recorded yet.'],
    promotedAt: new Date().toISOString(),
  }
}

async function restoreArtifact(filePath: string, previousArtifact: string | null) {
  if (previousArtifact === null) {
    if (await exists(filePath)) await unlink(filePath)
    return
  }

  await writeFile(filePath, previousArtifact, 'utf8')
}

function findCandidateRuleObject(raw: unknown) {
  const objects = collectObjects(raw)
  const candidate = objects.sort((a, b) => candidateRuleScore(b) - candidateRuleScore(a))[0]
  return candidate ?? raw
}

function collectObjects(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectObjects)

  const object = value as Record<string, unknown>
  return [object, ...Object.values(object).flatMap(collectObjects)]
}

function candidateRuleScore(value: Record<string, unknown>) {
  let score = 0
  if (typeof value.ruleId === 'string') score += 40
  if (typeof value.domain === 'string') score += 20
  if (typeof value.ruleType === 'string') score += 20
  if (value.reviewStatus === 'draft') score += 20
  if (value.approvedForRuntime === false) score += 20
  if (value.source && typeof value.source === 'object' && !Array.isArray(value.source)) score += 20
  if (Array.isArray(value.conditions)) score += 25
  if (Array.isArray(value.conclusions)) score += 25
  if (typeof value.missingDataBehavior === 'string') score += 15
  if (value.humanReview && typeof value.humanReview === 'object' && !Array.isArray(value.humanReview)) score += 15
  return score
}

function formatCandidateRuleError(issues: Array<{ path: PropertyKey[]; message: string }>, raw: unknown) {
  const fields = issues.map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`).join('; ')
  const topLevelKeys = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw as Record<string, unknown>).join(', ') : typeof raw
  return `LLM returned JSON, but not a valid candidate rule. Missing or invalid fields: ${fields}. Top-level response shape: ${topLevelKeys}. Try "Skip LLM: load prepared candidate" for the deterministic demo path, or retry claim drafting.`
}

async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

app.listen(port, host, () => {
  console.log(`Review console API listening on http://${host}:${port}`)
})
