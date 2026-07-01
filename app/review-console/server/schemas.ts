import { z } from 'zod'

export const SourceInputSchema = z.object({
  sourceId: z.string().min(1),
  domain: z.string().min(1),
  sourceType: z.enum(['paper', 'policy', 'audit', 'guideline', 'expert_note']),
  text: z.string().min(1),
})

export const ClaimSchema = z.object({
  claimId: z.string().min(1),
  quote: z.string().min(1),
  candidateMeaning: z.string().min(1),
  claimType: z.string().min(1),
  ruleCandidatePotential: z.string().min(1),
  requiresHumanReview: z.literal(true),
})

export const ClaimsResponseSchema = z.object({
  sourceId: z.string().min(1),
  claims: z.array(ClaimSchema),
})

export const DraftRuleInputSchema = z.object({
  domain: z.string().min(1),
  canonicalConcepts: z.array(z.string()).default([]),
  claim: ClaimSchema.extend({
    sourceId: z.string().min(1),
  }),
})

export const CandidateRuleSchema = z.object({
  ruleId: z.string().min(1),
  domain: z.string().min(1),
  title: z.string().min(1).optional(),
  ruleType: z.string().min(1),
  reviewStatus: z.literal('draft'),
  approvedForRuntime: z.literal(false),
  source: z.object({
    sourceId: z.string().min(1),
    quote: z.string().min(1),
  }),
  conditions: z.array(z.string()),
  conclusions: z.array(z.string()),
  missingDataBehavior: z.string().min(1),
  humanReview: z.object({
    required: z.literal(true),
    reviewNotes: z.array(z.string()),
  }),
})

export const TraceSchema = z.object({
  caseId: z.string().min(1),
  risk: z.string().min(1),
  decision: z.string().min(1),
  activatedRules: z.array(z.string()),
  usedEvidence: z.array(z.string()),
  missingData: z.array(z.string()),
  sources: z.array(z.string()),
  nextSteps: z.array(z.string()),
  humanReview: z.array(z.string()),
})

export const SourceSnippetSchema = z.object({
  sourceId: z.string().min(1),
  snippet: z.string().min(1),
})

export const TraceVerbalizationInputSchema = z.object({
  trace: TraceSchema,
  sourceSnippets: z.array(SourceSnippetSchema),
})

export const TraceVerbalizationOutputSchema = z.object({
  caseId: z.string().min(1),
  answer: z.string().min(1),
  usedSources: z.array(z.string()),
  limitations: z.array(z.string()),
})

export const RuntimeCaseFactInputSchema = z.object({
  caseId: z.string().regex(/^[a-z][A-Za-z0-9_]*$/, 'caseId must be a safe AgentSpeak atom, e.g. user_case_001'),
  facts: z.array(z.string().min(1)).max(200),
})

export const ApprovedRuleSchema = z.object({
  ruleId: z.string().min(1),
  domain: z.string().min(1),
  title: z.string().min(1),
  ruleType: z.string().min(1),
  reviewStatus: z.literal('approved'),
  approvedForRuntime: z.literal(true),
  source: z.object({
    sourceId: z.string().min(1),
    quote: z.string().min(1),
  }).passthrough(),
  conditions: z.array(z.string()),
  conclusions: z.array(z.string()),
  missingDataBehavior: z.string().min(1),
  runtimeImplementation: z.object({
    agentFile: z.string().min(1),
    activatedRuleFact: z.string().min(1),
    sourceMappingFact: z.string().min(1),
  }),
  validatedBy: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
}).passthrough()

export const CompilableRuleSchema = ApprovedRuleSchema.extend({
  compilation: z.object({
    derivedPredicates: z.array(z.object({
      name: z.string().min(1),
      definition: z.string().min(1),
      usedByRuleIds: z.array(z.string()).min(2),
    })).default([]),
    priority: z.number().int().default(0),
    emitsEvidence: z.boolean().default(true),
    emitsActivatedRule: z.boolean().default(true),
  }).optional(),
})
