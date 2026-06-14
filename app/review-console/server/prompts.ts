export function claimExtractionPrompt(inputJson: string) {
  return `You extract source-grounded claims for a traceability framework.

Use only the provided source text.
Do not infer facts that are not present.
Do not create executable rules.
Return only valid JSON matching this schema:
{
  "sourceId": "string",
  "claims": [
    {
      "claimId": "string",
      "quote": "string",
      "candidateMeaning": "string",
      "claimType": "threshold | obligation | prohibition | classification | exception | context",
      "ruleCandidatePotential": "high | medium | low",
      "requiresHumanReview": true
    }
  ]
}

Every claim must include an exact quote from the input text.
Mark every claim as requiring human review.

Input:
${inputJson}`
}

export function ruleDraftingPrompt(inputJson: string) {
  return `You draft candidate rules for a symbolic Jason/AgentSpeak traceability framework.

The output is a draft only. Never mark a rule as approved.
Use only the provided claim and canonical concepts.
Do not invent thresholds, sources, or conclusions.
If the claim is not operational enough, return a draft with review notes explaining the ambiguity.
Missing data must not be treated as negative evidence.
Conditions and conclusions must be AgentSpeak-compatible fragments, not prose.
Use Case as the case variable.
Valid condition examples: score(Case, cmr_mass_score, Score), cutoff(cmr_mass_score, Cutoff), Score >= Cutoff, not usable_case_data(Case).
Valid conclusion examples: risk(Case, high), decision(Case, cmr_driven_high_suspicion), activated_rule(Case, cmr_mass_score_above_cutoff), requires_human_review(Case, missing_critical_data).
Return only valid JSON matching this schema:
{
  "ruleId": "string",
  "domain": "string",
  "title": "string",
  "ruleType": "threshold | obligation | prohibition | classification | exception | context",
  "reviewStatus": "draft",
  "approvedForRuntime": false,
  "source": {
    "sourceId": "string",
    "quote": "string"
  },
  "conditions": ["string"],
  "conclusions": ["string"],
  "missingDataBehavior": "do_not_assume_negative | require_human_review | not_applicable",
  "humanReview": {
    "required": true,
    "reviewNotes": ["string"]
  }
}

Input:
${inputJson}`
}

export function traceVerbalizationPrompt(inputJson: string) {
  return `You verbalize a structured trace produced by a symbolic Jason/AgentSpeak agent.

Use only the provided trace fields and source snippets.
Do not add clinical, legal, compliance, or operational facts.
Do not add recommendations, decisions, rules, evidence, or sources that are absent from the input.
Mention missing data when present.
Mention human review requirements when present.
If the trace says risk is unknown, do not phrase it as low risk.
Return only valid JSON matching this schema:
{
  "caseId": "string",
  "answer": "string",
  "usedSources": ["string"],
  "limitations": ["string"]
}

Input:
${inputJson}`
}
