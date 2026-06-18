from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "examples.jsonl"


def load_examples() -> list[dict[str, Any]]:
    return [json.loads(line) for line in DATA_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]


def source_input(example: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceId": example["sourceId"],
        "domain": example["domain"],
        "sourceType": example["sourceType"],
        "text": example["text"],
    }


def rule_input(example: dict[str, Any]) -> dict[str, Any]:
    return {
        "domain": example["domain"],
        "canonicalConcepts": example["canonicalConcepts"],
        "claim": example["claim"],
    }


def build_demos(task: str, count: int) -> list[Any]:
    if count <= 0:
        return []

    import dspy

    demos: list[dspy.Example] = []
    for example in load_examples():
        if example["task"] != task:
            continue

        if task == "extract_claims":
            demos.append(
                dspy.Example(
                    source_json=json.dumps(source_input(example)),
                    claims_json=json.dumps(example["expected"]),
                ).with_inputs("source_json")
            )
        elif task == "draft_rule":
            demos.append(
                dspy.Example(
                    rule_input_json=json.dumps(rule_input(example)),
                    candidate_rule_json=json.dumps(example["expected"]),
                ).with_inputs("rule_input_json")
            )

        if len(demos) >= count:
            return demos

    return demos
