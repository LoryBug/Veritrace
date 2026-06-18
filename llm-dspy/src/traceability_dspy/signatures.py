from __future__ import annotations

import dspy


class ExtractClaimsSignature(dspy.Signature):
    """Extract source-grounded claims for a traceability framework.

    Use only the provided source text. Do not infer facts that are not present.
    Do not create executable rules. Return only a JSON object encoded as a string.
    Every claim must include an exact quote from the input text and must require human review.

    Required output shape:
    {
      "sourceId": "same sourceId from input",
      "claims": [
        {
          "claimId": "snake_case identifier",
          "quote": "exact quote copied from input text",
          "candidateMeaning": "plain-language meaning",
          "claimType": "threshold | obligation | prohibition | classification | exception | context | workflow_guardrail | safety_invariant | finding_to_action | change_control",
          "ruleCandidatePotential": "high | medium | low",
          "requiresHumanReview": true
        }
      ]
    }
    """

    source_json: str = dspy.InputField(desc="JSON with sourceId, domain, sourceType, and text")
    claims_json: str = dspy.OutputField(
        desc="JSON string with exactly sourceId and claims; do not use claim/requiresReview/reviewStatus aliases"
    )


class DraftRuleSignature(dspy.Signature):
    """Draft a candidate symbolic rule for a Jason/AgentSpeak traceability framework.

    The output is a draft only. Never mark a rule as approved.
    Use only the provided claim and canonical concepts. Do not invent thresholds, sources, or conclusions.
    Missing data must not be treated as negative evidence.

    Conditions and conclusions must be AgentSpeak-compatible fragments, not prose:
    - no quoted atoms like risk(Case, "high") or risk(Case, 'high'); use risk(Case, high)
    - no trailing periods
    - use predicate fragments such as score(Case, cmr_mass_score, Score)
    - use comparisons such as Score >= Cutoff
    - use negation only as not predicate(...)
    - prefer predicates/constants from canonicalConcepts exactly when available

    Drafting pattern:
    - If a claim says evidence/action X is required before allowing Y, do not conclude has_x(...).
    - Instead use a missing/absent condition such as missing_data(Case, x) or not has_x(Entity),
      then conclude decision(..., require_x), decision(..., block_until_x), or requires_human_review(...).
    - If a claim says missing evidence must not imply low/negative risk, conclude risk(Case, unknown)
      and a human-review or insufficient-data decision.

    Required output shape:
    {
      "ruleId": "snake_case identifier",
      "domain": "same domain from input",
      "ruleType": "claim claimType",
      "reviewStatus": "draft",
      "approvedForRuntime": false,
      "source": {"sourceId": "claim sourceId", "quote": "exact claim quote"},
      "conditions": ["AgentSpeak-compatible fragment"],
      "conclusions": ["AgentSpeak-compatible fragment"],
      "missingDataBehavior": "do_not_assume_negative | require_human_review | not_applicable",
      "humanReview": {"required": true, "reviewNotes": ["review note"]}
    }
    """

    rule_input_json: str = dspy.InputField(desc="JSON with domain, canonical concepts, and one source-grounded claim")
    candidate_rule_json: str = dspy.OutputField(
        desc="JSON string matching the candidate-rule schema; include source, missingDataBehavior, humanReview, reviewStatus=draft, approvedForRuntime=false"
    )
