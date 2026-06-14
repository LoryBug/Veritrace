export type SourceType = 'paper' | 'policy' | 'audit' | 'guideline' | 'expert_note'

export type Claim = {
  claimId: string
  quote: string
  candidateMeaning: string
  claimType: string
  ruleCandidatePotential: string
  requiresHumanReview: true
}

export type CandidateRule = {
  ruleId: string
  domain: string
  title?: string
  ruleType: string
  reviewStatus: 'draft'
  approvedForRuntime: false
  source: {
    sourceId: string
    quote: string
  }
  conditions: string[]
  conclusions: string[]
  missingDataBehavior: string
  humanReview: {
    required: true
    reviewNotes: string[]
  }
}

export type ReviewedRule = Omit<CandidateRule, 'reviewStatus' | 'approvedForRuntime'> & {
  reviewStatus: 'approved' | 'rejected' | 'needs_revision'
  approvedForRuntime: boolean
  reviewedAt: string
  reviewNotes: string[]
}

export type LlmStatus = {
  provider: 'groq' | 'openrouter'
  model: string
  configured: boolean
}

export type RuntimeCase = {
  caseId: string
  label: string
  expectedTracePath: string
}

export type RuntimeTrace = {
  caseId: string
  risk: string
  decision: string
  activatedRules: string[]
  usedEvidence: string[]
  missingData: string[]
  sources: string[]
  nextSteps: string[]
  humanReview: string[]
}

export type SourceSnippet = {
  sourceId: string
  snippet: string
}

export type RuntimeTraceResponse = {
  mode: 'expected_trace_demo'
  note: string
  case: RuntimeCase
  trace: RuntimeTrace
  sourceSnippets: SourceSnippet[]
}

export type TraceVerbalization = {
  caseId: string
  answer: string
  usedSources: string[]
  limitations: string[]
}

export type ApprovedRuntimeRule = {
  ruleId: string
  domain: string
  title: string
  ruleType: string
  reviewStatus: 'approved'
  approvedForRuntime: true
  source: {
    sourceId: string
    quote: string
    [key: string]: unknown
  }
  conditions: string[]
  conclusions: string[]
  missingDataBehavior: string
  runtimeImplementation: {
    agentFile: string
    activatedRuleFact: string
    sourceMappingFact: string
  }
  validatedBy: string[]
  limitations: string[]
  artifactPath?: string
}

export type AuditEvent = {
  eventId: string
  timestamp: string
  eventType: string
  actor: 'system' | 'llm' | 'human_reviewer' | 'runtime_demo'
  status: 'started' | 'success' | 'failure'
  details: Record<string, unknown>
}
