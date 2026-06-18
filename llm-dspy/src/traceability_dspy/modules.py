from __future__ import annotations

import dspy

from traceability_dspy.signatures import DraftRuleSignature, ExtractClaimsSignature


class ExtractClaims(dspy.Module):
    def __init__(self, demos: list[dspy.Example] | None = None) -> None:
        self.predict = dspy.Predict(ExtractClaimsSignature)
        self.predict.demos = demos or []

    def forward(self, source_json: str):
        return self.predict(source_json=source_json)


class DraftCandidateRule(dspy.Module):
    def __init__(self, demos: list[dspy.Example] | None = None) -> None:
        self.predict = dspy.Predict(DraftRuleSignature)
        self.predict.demos = demos or []

    def forward(self, rule_input_json: str):
        return self.predict(rule_input_json=rule_input_json)
