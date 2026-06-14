import type { ApprovedRuntimeRule, AuditEvent, CandidateRule, Claim, LlmStatus, RuntimeCase, RuntimeTraceResponse, SourceSnippet, SourceType, TraceVerbalization, RuntimeTrace } from './types'

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body.error || 'Request failed')
  }
  return body as T
}

export async function fetchHealth() {
  return parseResponse<{ ok: boolean; llm: LlmStatus }>(await fetch('/api/health'))
}

export async function extractClaims(input: {
  sourceId: string
  domain: string
  sourceType: SourceType
  text: string
}) {
  return parseResponse<{ sourceId: string; claims: Claim[] }>(
    await fetch('/api/extract-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function draftRule(input: {
  domain: string
  canonicalConcepts: string[]
  claim: Claim & { sourceId: string }
}) {
  return parseResponse<CandidateRule>(
    await fetch('/api/draft-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function fetchRuntimeCases() {
  return parseResponse<{ cases: RuntimeCase[] }>(await fetch('/api/runtime/cases'))
}

export async function fetchApprovedRules() {
  return parseResponse<{ rules: ApprovedRuntimeRule[] }>(await fetch('/api/approved-rules'))
}

export async function compileApprovedRules() {
  return parseResponse<{ generatedFiles: string[]; stdout: string; stderr: string }>(
    await fetch('/api/compile-rules', {
      method: 'POST',
    }),
  )
}

export async function fetchRuntimeTrace(caseId: string) {
  return parseResponse<RuntimeTraceResponse>(await fetch(`/api/runtime/trace/${encodeURIComponent(caseId)}`))
}

export async function verbalizeTrace(input: { trace: RuntimeTrace; sourceSnippets: SourceSnippet[] }) {
  return parseResponse<TraceVerbalization>(
    await fetch('/api/verbalize-trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function fetchAuditEvents(limit = 50) {
  return parseResponse<{ events: AuditEvent[] }>(await fetch(`/api/audit-events?limit=${limit}`))
}

export async function recordAuditEvent(input: {
  eventType: string
  actor: AuditEvent['actor']
  status: AuditEvent['status']
  details: Record<string, unknown>
}) {
  return parseResponse<{ event: AuditEvent }>(
    await fetch('/api/audit-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function clearAuditEvents() {
  return parseResponse<{ ok: boolean }>(
    await fetch('/api/audit-events', {
      method: 'DELETE',
    }),
  )
}
