const modalityLabels: Record<string, string> = {
  echo: 'echocardiography',
  cmr: 'cardiac magnetic resonance',
  ct_pet: 'cardiac CT/PET pathway',
  pet: 'PET parameters',
}

const riskLabels: Record<string, string> = {
  high: 'The case is classified as high suspicion.',
  mid: 'The case is classified as intermediate suspicion and needs further clarification.',
  low: 'The case is classified as low suspicion based on available data.',
  unknown: 'The risk cannot be determined from the available data.',
}

const decisionLabels: Record<string, string> = {
  cmr_driven_high_suspicion: 'The decision is driven by CMR findings and score-based high suspicion.',
  insufficient_data: 'There is not enough usable information to produce a risk decision.',
  cardiac_ct_gray_zone: 'The CT/PET pathway is in a gray zone and needs additional PET parameters or review.',
  concordant_high_suspicion_echo_cmr: 'Echocardiography and CMR are concordant for high suspicion.',
  significant_echocardiographic_suspicion: 'Echocardiography shows significant suspicion and second-level imaging is needed.',
  low_suspicion_with_available_data: 'No encoded cutoff is exceeded among the available data.',
}

const ruleLabels: Record<string, string> = {
  cmr_mass_score_above_cutoff: 'CMR Mass Score reached the approved cutoff rule.',
  critical_data_missing: 'Critical examination data are missing.',
  ct_gray_zone_without_pet: 'Cardiac CT is gray-zone and PET parameters are missing.',
  dem_score_above_cutoff: 'DEM Score reached the approved cutoff rule.',
  concordant_echo_cmr_high_suspicion: 'Echo and CMR rules point to concordant high suspicion.',
  no_cutoff_exceeded: 'No approved cutoff rule was exceeded among available data.',
}

const actionLabels: Record<string, string> = {
  heart_team_discussion: 'Discuss the case in the Heart Team.',
  staging_or_histological_assessment: 'Proceed with staging or histological assessment if clinically appropriate.',
  collect_minimum_required_data: 'Collect the minimum required examination data before deciding.',
  perform_pet_ct: 'Enter or perform PET/CT assessment to clarify the pathway.',
  consider_cmr: 'Consider CMR as an additional imaging step.',
  perform_cmr: 'Perform cardiac CMR if available.',
  follow_up_if_clinically_indicated: 'Follow up if clinically indicated.',
}

const reviewLabels: Record<string, string> = {
  missing_critical_data: 'Human review is required because critical data are missing.',
  missing_pet_parameters: 'Human review is required because PET parameters are missing in a gray-zone CT/PET pathway.',
  conflicting_rules: 'Human review is required because multiple rules may conflict.',
  high_impact_decision: 'Human review is recommended because the decision has high impact.',
}

export function humanizeFact(fact: string) {
  const normalized = fact.trim()

  const score = normalized.match(/^score\(([^,]+),\s*([^,]+),\s*([^\)]+)\)$/)
  if (score) {
    const [, caseId, metric, value] = score
    return `${labelMetric(metric)} is available for ${caseId} with value ${value}.`
  }

  const cutoff = normalized.match(/^cutoff\(([^,]+),\s*([^\)]+)\)$/)
  if (cutoff) {
    const [, metric, value] = cutoff
    return `${labelMetric(metric)} has an approved cutoff of ${value}.`
  }

  const risk = normalized.match(/^risk\([^,]+,\s*([^\)]+)\)$/)
  if (risk) return riskLabels[risk[1]] || `Risk is set to ${risk[1]}.`

  const decision = normalized.match(/^decision\([^,]+,\s*([^\)]+)\)$/)
  if (decision) return decisionLabels[decision[1]] || `Decision is set to ${decision[1]}.`

  const activatedRule = normalized.match(/^activated_rule\([^,]+,\s*([^\)]+)\)$/)
  if (activatedRule) return ruleLabels[activatedRule[1]] || `Rule ${activatedRule[1]} is activated.`

  const unavailable = normalized.match(/^unavailable\(([^,]+),\s*([^\)]+)\)$/)
  if (unavailable) {
    const [, caseId, modality] = unavailable
    return `${labelModality(modality)} is missing for ${caseId}.`
  }

  const ctLevel = normalized.match(/^ct_level\(([^,]+),\s*([^\)]+)\)$/)
  if (ctLevel) {
    const [, caseId, level] = ctLevel
    return `Cardiac CT level for ${caseId} is ${level.replace(/_/g, ' ')}.`
  }

  if (normalized === 'Score >= Cutoff') {
    return 'The observed score reaches or exceeds the approved cutoff.'
  }

  return normalized
}

export function humanizeRuleId(ruleId: string) {
  return ruleLabels[ruleId] || `Rule ${ruleId.replace(/_/g, ' ')} was activated.`
}

export function humanizeMissingData(value: string) {
  return `${labelModality(value)} is missing or unavailable.`
}

export function humanizeNextStep(value: string) {
  return actionLabels[value] || value.replace(/_/g, ' ')
}

export function humanizeReviewReason(value: string) {
  return reviewLabels[value] || value.replace(/_/g, ' ')
}

export function humanizeMissingDataBehavior(value: string) {
  if (value === 'do_not_assume_negative') {
    return 'If required data are missing, the system must not treat them as negative evidence.'
  }
  if (value === 'require_human_review') {
    return 'If required data are missing, the case should be sent to human review.'
  }
  if (value === 'not_applicable') {
    return 'This rule does not define special missing-data behavior.'
  }
  return value
}

function labelMetric(metric: string) {
  return metric
    .replace('cmr_mass_score', 'CMR Mass Score')
    .replace('dem_score', 'DEM Score')
    .replace('suv_max', 'SUV max')
    .replace('mtv', 'metabolic tumor volume')
    .replace('tlg', 'total lesion glycolysis')
}

function labelModality(value: string) {
  return modalityLabels[value] || value.replace(/_/g, ' ')
}
