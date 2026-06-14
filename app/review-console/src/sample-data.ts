import type { CandidateRule, Claim } from './types'

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
