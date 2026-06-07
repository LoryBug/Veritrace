// Runtime coordinator for the planned Jason MAS runtime.
// It orchestrates the CLI-first flow and emits the trace contract.

// First CLI milestone: run one golden case.
// Change this initial goal to gc00 or gc_gray_zone for the next runs.
!evaluate_and_export(gc04).

+!evaluate_and_export(Case)
  <- .send(case_reasoner, achieve, evaluate_case(Case)).

+reasoner_done(Case)
  <- .send(trace_guardian, achieve, guard_trace(Case)).

+guardian_done(Case)
  <- .send(care_planner, achieve, plan_case(Case)).

+planner_done(Case)
  <- !export_trace(Case).

// Final trace export. The parser in tools/trace/parse-jason-trace.mjs consumes these lines.
+!export_trace(Case)
  : risk(Case, Risk) & decision(Case, Decision)
  <- .findall(Rule, activated_rule(Case, Rule), Rules);
     .findall(Evidence, used_evidence(Case, Evidence), EvidenceList);
     .findall(Missing, missing_data(Case, Missing), MissingData);
     .findall(Source, source_trace(Case, Source), Sources);
     .findall(NextStep, next_step(Case, NextStep), NextSteps);
     .findall(ReviewReason, requires_human_review(Case, ReviewReason), HumanReview);
     .print("TRACE_EXPORT_BEGIN");
     .print("TRACE_CASE=", Case);
     .print("TRACE_RISK=", Risk);
     .print("TRACE_DECISION=", Decision);
     .print("TRACE_ACTIVATED_RULES=", Rules);
     .print("TRACE_USED_EVIDENCE=", EvidenceList);
     .print("TRACE_MISSING_DATA=", MissingData);
     .print("TRACE_SOURCES=", Sources);
     .print("TRACE_NEXT_STEPS=", NextSteps);
     .print("TRACE_HUMAN_REVIEW=", HumanReview);
     .print("TRACE_EXPORT_END");
     .stopMAS.

+!export_trace(Case)
  <- .print("TRACE_EXPORT_BEGIN");
     .print("TRACE_CASE=", Case);
     .print("TRACE_ERROR=missing_risk_or_decision");
     .print("TRACE_EXPORT_END");
     .stopMAS.
