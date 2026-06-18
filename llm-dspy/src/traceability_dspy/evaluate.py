from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from statistics import mean
from typing import Any

from traceability_dspy.examples import build_demos, load_examples, rule_input, source_input
from traceability_dspy.metrics import candidate_rule_score, claim_extraction_score


def main() -> None:
    args = parse_args()
    examples = load_examples()
    extract_claims = None
    draft_rule = None
    if args.mode == "live":
        from traceability_dspy.config import configure_dspy
        from traceability_dspy.modules import DraftCandidateRule, ExtractClaims

        configure_dspy()
        extract_claims = ExtractClaims(demos=build_demos("extract_claims", args.demo_count))
        draft_rule = DraftCandidateRule(demos=build_demos("draft_rule", args.demo_count))

    scores: list[float] = []
    results: list[dict[str, Any]] = []
    error_count = 0

    for example in examples:
        if args.task != "all" and example["task"] != args.task:
            continue

        if example["task"] == "extract_claims":
            prediction_json, error = run_extract_claims(args.mode, extract_claims, example, args.retries, args.retry_seconds)
            score = claim_extraction_score(example["expected"], prediction_json) if prediction_json else 0.0
            scores.append(score)
            results.append(
                {
                    "task": "extract_claims",
                    "id": example["sourceId"],
                    "score": score,
                    "prediction": parse_prediction(prediction_json) if prediction_json else None,
                    "error": error,
                }
            )
            print(f"extract_claims {example['sourceId']}: {score:.2f}")
            if error:
                print(f"  error: {error}")
                error_count += 1

        if example["task"] == "draft_rule":
            prediction_json, error = run_draft_rule(args.mode, draft_rule, example, args.retries, args.retry_seconds)
            score = candidate_rule_score(example["expected"], prediction_json) if prediction_json else 0.0
            scores.append(score)
            results.append(
                {
                    "task": "draft_rule",
                    "id": example["claim"]["claimId"],
                    "score": score,
                    "prediction": parse_prediction(prediction_json) if prediction_json else None,
                    "error": error,
                }
            )
            print(f"draft_rule {example['claim']['claimId']}: {score:.2f}")
            if error:
                print(f"  error: {error}")
                error_count += 1

        if args.mode == "live" and error_count >= args.max_errors:
            print(f"stopping after {error_count} live provider error(s)")
            break

    average_score = mean(scores) if scores else None
    print(f"average_score: {average_score:.2f}" if average_score is not None else "no examples evaluated")

    if args.report:
        report = {
            "mode": args.mode,
            "task": args.task,
            "demoCount": args.demo_count if args.mode == "live" else 0,
            "exampleCount": len(results),
            "averageScore": average_score,
            "results": results,
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"report: {args.report}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate traceability-agent DSPy modules.")
    parser.add_argument(
        "--mode",
        choices=["live", "fixtures"],
        default="live",
        help="Use live DSPy calls or score checked-in expected outputs as fixtures.",
    )
    parser.add_argument(
        "--task",
        choices=["all", "extract_claims", "draft_rule"],
        default="all",
        help="Limit evaluation to one DSPy task.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("output/dspy/evaluation-report.json"),
        help="Path for a local JSON evaluation report.",
    )
    parser.add_argument(
        "--max-errors",
        type=int,
        default=1,
        help="Stop live evaluation after this many provider errors.",
    )
    parser.add_argument(
        "--demo-count",
        type=int,
        default=4,
        help="Number of checked-in examples to use as DSPy demos for each live task.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retry live provider calls this many times for transient rate-limit errors.",
    )
    parser.add_argument(
        "--retry-seconds",
        type=float,
        default=15.0,
        help="Seconds to wait before retrying a live rate-limit error.",
    )
    return parser.parse_args()


def run_extract_claims(
    mode: str,
    extract_claims: Any,
    example: dict[str, Any],
    retries: int,
    retry_seconds: float,
) -> tuple[str | None, str | None]:
    if mode == "fixtures":
        return json.dumps(example["expected"]), None

    return with_rate_limit_retries(
        lambda: extract_claims(source_json=json.dumps(source_input(example))).claims_json,
        retries,
        retry_seconds,
    )


def run_draft_rule(
    mode: str,
    draft_rule: Any,
    example: dict[str, Any],
    retries: int,
    retry_seconds: float,
) -> tuple[str | None, str | None]:
    if mode == "fixtures":
        return json.dumps(example["expected"]), None

    return with_rate_limit_retries(
        lambda: draft_rule(rule_input_json=json.dumps(rule_input(example))).candidate_rule_json,
        retries,
        retry_seconds,
    )


def with_rate_limit_retries(call: Any, retries: int, retry_seconds: float) -> tuple[str | None, str | None]:
    for attempt in range(retries + 1):
        try:
            return call(), None
        except Exception as exc:  # noqa: BLE001 - provider exceptions vary by backend.
            error = short_error(exc)
            if attempt >= retries or not is_rate_limit_error(error):
                return None, error

            print(f"  rate limit, retrying in {retry_seconds:.0f}s")
            time.sleep(retry_seconds)

    return None, "unexpected retry exhaustion"


def parse_prediction(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def short_error(exc: Exception) -> str:
    message = str(exc).replace("\n", " ")
    return message[:500]


def is_rate_limit_error(message: str) -> bool:
    lowered = message.casefold()
    return "ratelimit" in lowered or "rate limit" in lowered or "rate_limit" in lowered


if __name__ == "__main__":
    main()
