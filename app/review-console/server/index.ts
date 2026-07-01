import cors from 'cors'
import { execFile } from 'node:child_process'
import dotenv from 'dotenv'
import express from 'express'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { clearAuditEvents, readAuditEvents, recordAuditEvent } from './audit.js'
import { completeJson, publicLlmStatus } from './llm.js'
import { claimExtractionPrompt, ruleDraftingPrompt, traceVerbalizationPrompt } from './prompts.js'
import { CandidateRuleSchema, ClaimsResponseSchema, DraftRuleInputSchema, RuntimeCaseFactInputSchema, SourceInputSchema, TraceSchema, TraceVerbalizationInputSchema, TraceVerbalizationOutputSchema } from './schemas.js'
import { loadApprovedRules } from './approved-rules.js'
import { loadRuntimeTrace, runtimeCases, sourceSnippetsFor } from './runtime-demo.js'

dotenv.config()

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(process.cwd(), '../..')
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
    const parsed = CandidateRuleSchema.parse(raw)
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

    const compileScript = path.join(repoRoot, 'tools/mas/compile-rules.mjs')
    const validateScript = path.join(repoRoot, 'tools/mas/validate-compilation.mjs')
    const compile = await execFileAsync(process.execPath, [compileScript], { cwd: repoRoot })
    const validate = await execFileAsync(process.execPath, [validateScript], { cwd: repoRoot })

    const result = {
      generatedFiles: [
        'agents/case_reasoner_generated.asl',
        'beliefs/approved_rules.asl',
        'beliefs/approved_rule_sources.asl',
      ],
      stdout: `${compile.stdout}${validate.stdout}`.trim(),
      stderr: `${compile.stderr}${validate.stderr}`.trim(),
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

app.listen(port, host, () => {
  console.log(`Review console API listening on http://${host}:${port}`)
})
