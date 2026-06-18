from __future__ import annotations

import json
import re
from typing import Any


def parse_json(value: str) -> Any | None:
    try:
        parsed = json.loads(value)
        if isinstance(parsed, str) and parsed.strip().startswith(("{", "[")):
            return parse_json(parsed)
        return parsed
    except json.JSONDecodeError:
        return None


def claim_extraction_score(expected: dict[str, Any], prediction_json: str) -> float:
    prediction = parse_json(prediction_json)
    if not isinstance(prediction, dict):
        return 0.0

    score = 0.0
    if prediction.get("sourceId") == expected.get("sourceId"):
        score += 0.15

    claims = prediction.get("claims")
    expected_claims = expected.get("claims")
    if not isinstance(claims, list) or not claims:
        return score
    if not isinstance(expected_claims, list) or not expected_claims:
        return min(score + 0.15, 1.0)

    score += 0.15
    score += 0.7 * average_claim_score(expected_claims, claims)

    return min(score, 1.0)


def candidate_rule_score(expected: dict[str, Any], prediction_json: str) -> float:
    prediction = parse_json(prediction_json)
    if not isinstance(prediction, dict):
        return 0.0

    if not agent_speak_fragments_are_valid(prediction.get("conditions")):
        return 0.0
    if not agent_speak_fragments_are_valid(prediction.get("conclusions")):
        return 0.0

    score = 0.0
    if prediction.get("reviewStatus") == "draft":
        score += 0.15
    if prediction.get("approvedForRuntime") is False:
        score += 0.15
    if prediction.get("source", {}).get("sourceId") == expected.get("source", {}).get("sourceId"):
        score += 0.1
    if normalize_text(prediction.get("source", {}).get("quote")) == normalize_text(expected.get("source", {}).get("quote")):
        score += 0.1
    score += 0.15 * fragment_overlap(expected.get("conditions"), prediction.get("conditions"))
    score += 0.15 * fragment_overlap(expected.get("conclusions"), prediction.get("conclusions"))
    if prediction.get("missingDataBehavior") == expected.get("missingDataBehavior"):
        score += 0.1
    elif prediction.get("missingDataBehavior") in {"do_not_assume_negative", "require_human_review", "not_applicable"}:
        score += 0.05
    if prediction.get("humanReview", {}).get("required") is True:
        score += 0.1

    return min(score, 1.0)


def average_claim_score(expected_claims: list[Any], predicted_claims: list[Any]) -> float:
    scores = []
    for expected_claim in expected_claims:
        if not isinstance(expected_claim, dict):
            continue
        best = 0.0
        for predicted_claim in predicted_claims:
            if isinstance(predicted_claim, dict):
                best = max(best, single_claim_score(expected_claim, predicted_claim))
        scores.append(best)

    return mean_or_zero(scores)


def single_claim_score(expected: dict[str, Any], prediction: dict[str, Any]) -> float:
    score = 0.0
    if prediction.get("requiresHumanReview") is True:
        score += 0.2
    if normalize_text(prediction.get("quote")) == normalize_text(expected.get("quote")):
        score += 0.3
    elif prediction.get("quote"):
        score += 0.1
    if prediction.get("claimType") == expected.get("claimType"):
        score += 0.2
    elif prediction.get("claimType"):
        score += 0.05
    if prediction.get("ruleCandidatePotential") == expected.get("ruleCandidatePotential"):
        score += 0.15
    elif prediction.get("ruleCandidatePotential") in {"high", "medium", "low"}:
        score += 0.05
    if prediction.get("claimId"):
        score += 0.05
    if prediction.get("candidateMeaning"):
        score += 0.1

    return min(score, 1.0)


def fragment_overlap(expected: Any, prediction: Any) -> float:
    if not isinstance(expected, list) or not expected:
        return 0.0
    if not isinstance(prediction, list) or not prediction:
        return 0.0

    expected_set = {normalize_fragment(item) for item in expected if isinstance(item, str)}
    prediction_set = {normalize_fragment(item) for item in prediction if isinstance(item, str)}
    if not expected_set:
        return 0.0

    return len(expected_set & prediction_set) / len(expected_set)


def normalize_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.casefold().split())


def normalize_fragment(value: str) -> str:
    return re.sub(r"\s+", "", value.casefold())


def mean_or_zero(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def agent_speak_fragments_are_valid(value: Any) -> bool:
    if not isinstance(value, list) or not value:
        return False

    return all(is_agent_speak_fragment(item) for item in value)


def is_agent_speak_fragment(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    fragment = value.strip()
    if not fragment or fragment.endswith("."):
        return False

    if fragment.startswith("not "):
        return is_agent_speak_fragment(fragment[4:].strip())

    if any(op in fragment for op in (">=", "=<", "=", ">", "<")):
        return bool(fragment.replace(" ", ""))

    if " " in fragment and "(" not in fragment:
        return False

    return bool(re.match(r"^[a-z][A-Za-z0-9_]*\([^()]*\)$", fragment))
