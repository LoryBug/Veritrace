import type { CandidateRule, Claim, SourceType } from './types'

type DemoSource = {
  sourceId: string
  domain: string
  sourceType: SourceType
  text: string
}

export type DemoPreset = {
  id: 'cardiac' | 'gdpr'
  label: string
  domainLabel: string
  source: DemoSource
  claims: Claim[]
  candidateRule: CandidateRule
  customCaseId: string
  customFacts: string
  benchmarkCaseIds: string[]
}

export const sampleSource = {
  sourceId: 'paolisso_2024_cmr_mass_score',
  domain: 'cardiac_mass',
  sourceType: 'paper' as const,
  text: 'CMR Mass Score cutoff >= 5 supports malignancy suspicion in cardiac mass evaluation.',
}

export const sampleClaims: Claim[] = [
  {
    claimId: 'claim_cmr_mass_score_cutoff',
    quote: 'CMR Mass Score cutoff >= 5 supports malignancy suspicion in cardiac mass evaluation.',
    candidateMeaning: 'A CMR Mass Score greater than or equal to 5 supports high suspicion in the cardiac mass workflow.',
    claimType: 'threshold',
    ruleCandidatePotential: 'high',
    requiresHumanReview: true,
  },
]

export const sampleCandidateRule: CandidateRule = {
  ruleId: 'cmr_mass_score_above_cutoff',
  domain: 'cardiac_mass',
  title: 'CMR Mass Score above cutoff',
  ruleType: 'threshold',
  reviewStatus: 'draft',
  approvedForRuntime: false,
  source: {
    sourceId: 'paolisso_2024_cmr_mass_score',
    quote: 'CMR Mass Score cutoff >= 5 supports malignancy suspicion in cardiac mass evaluation.',
  },
  conditions: ['score(Case, cmr_mass_score, Score)', 'cutoff(cmr_mass_score, Cutoff)', 'Score >= Cutoff'],
  conclusions: [
    'risk(Case, high)',
    'decision(Case, cmr_driven_high_suspicion)',
    'activated_rule(Case, cmr_mass_score_above_cutoff)',
  ],
  missingDataBehavior: 'do_not_assume_negative',
  humanReview: {
    required: true,
    reviewNotes: ['Verify that the source quote supports the threshold and conclusion strength.'],
  },
}

export const gdprSource = {
  sourceId: 'gdpr_reg_679_2016_art_33',
  domain: 'gdpr_compliance',
  sourceType: 'policy' as const,
  text: 'In case of a personal data breach, the controller notifies the competent supervisory authority without undue delay and, where feasible, not later than 72 hours after becoming aware of it, unless the breach is unlikely to result in a risk to rights and freedoms. If notification is not made within 72 hours, reasons for the delay accompany it.',
}

export const gdprClaims: Claim[] = [
  {
    claimId: 'claim_gdpr_breach_notify_72h',
    quote: 'the controller notifies the competent supervisory authority without undue delay and, where feasible, not later than 72 hours after becoming aware of it',
    candidateMeaning: 'A likely-risk personal-data breach should be notified to the supervisory authority within 72 hours of awareness where feasible.',
    claimType: 'obligation',
    ruleCandidatePotential: 'high',
    requiresHumanReview: true,
  },
]

export const gdprCandidateRule: CandidateRule = {
  ruleId: 'gdpr_breach_notification_overdue',
  domain: 'gdpr_compliance',
  title: 'GDPR personal-data breach notification overdue',
  ruleType: 'deadline_guard',
  reviewStatus: 'draft',
  approvedForRuntime: false,
  source: {
    sourceId: 'gdpr_reg_679_2016_art_33',
    quote: 'The controller notifies the competent supervisory authority without undue delay and, where feasible, not later than 72 hours after becoming aware of a personal data breach.',
  },
  conditions: [
    'data_breach(Case)',
    'breach_risk(Case, likely)',
    'breach_hours_since_awareness(Case, Hours)',
    'Hours > 72',
    'not notified_authority(Case)',
  ],
  conclusions: [
    'risk(Case, high)',
    'decision(Case, gdpr_breach_notification_overdue)',
    'activated_rule(Case, gdpr_breach_notification_overdue)',
  ],
  missingDataBehavior: 'require_human_review',
  humanReview: {
    required: true,
    reviewNotes: ['Verify breach risk, awareness time, and whether notification was already made before promotion.'],
  },
}

const cardiacCustomFacts = [
  'case(user_case_001).',
  'unavailable(user_case_001, echo).',
  'available(user_case_001, cmr).',
  'unavailable(user_case_001, ct_pet).',
  'unavailable(user_case_001, pet).',
  'score(user_case_001, cmr_mass_score, 5).',
].join('\n')

const gdprCustomFacts = [
  'case(gdpr_user_case).',
  'data_breach(gdpr_user_case).',
  'breach_risk(gdpr_user_case, likely).',
  'breach_hours_since_awareness(gdpr_user_case, 96).',
].join('\n')

export const demoPresets: DemoPreset[] = [
  {
    id: 'cardiac',
    label: 'Cardiac paper demo',
    domainLabel: 'Cardiac mass',
    source: sampleSource,
    claims: sampleClaims,
    candidateRule: sampleCandidateRule,
    customCaseId: 'user_case_001',
    customFacts: cardiacCustomFacts,
    benchmarkCaseIds: ['gc04', 'gc00', 'gc_gray_zone'],
  },
  {
    id: 'gdpr',
    label: 'GDPR compliance demo',
    domainLabel: 'GDPR compliance',
    source: gdprSource,
    claims: gdprClaims,
    candidateRule: gdprCandidateRule,
    customCaseId: 'gdpr_user_case',
    customFacts: gdprCustomFacts,
    benchmarkCaseIds: ['gdpr_lawful_processing', 'gdpr_missing_legal_basis', 'gdpr_special_category', 'gdpr_breach_overdue'],
  },
]
