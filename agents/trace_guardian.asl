// Trace guardian for the Jason MAS runtime.
// Owns lightweight meta-rules: missing data, approval gating, source grounding, review flags.

{ include("beliefs/approved_rule_sources.asl") }
{ include("beliefs/approved_rules.asl") }
{ include("cases/gc00.asl") }
{ include("cases/gc04.asl") }
{ include("cases/gc_gray_zone.asl") }

usable_case_data(Case) :-
    score(Case, Metric, Value).

usable_case_data(Case) :-
    observed(Case, Modality, Finding).

usable_case_data(Case) :-
    ct_level(Case, Level).

usable_case_data(Case) :-
    pet_positive(Case).

+!guard_trace(Case)
  <- !record_missing_data(Case);
     !check_runtime_review(Case);
     !check_rule_approval(Case);
     !emit_sources_for_activated_rules(Case);
     !check_conflicts(Case);
     !check_low_risk_safety(Case);
     .send(runtime_coordinator, tell, guardian_done(Case)).

// Missing data are made explicit. They are never treated as negative evidence.
+!record_missing_data(Case)
  : unavailable(Case, echo) & not missing_data(Case, echo)
  <- +missing_data(Case, echo);
     .send(runtime_coordinator, tell, missing_data(Case, echo));
     !record_missing_data(Case).

+!record_missing_data(Case)
  : unavailable(Case, cmr) & not missing_data(Case, cmr)
  <- +missing_data(Case, cmr);
     .send(runtime_coordinator, tell, missing_data(Case, cmr));
     !record_missing_data(Case).

+!record_missing_data(Case)
  : unavailable(Case, ct_pet) & not missing_data(Case, ct_pet)
  <- +missing_data(Case, ct_pet);
     .send(runtime_coordinator, tell, missing_data(Case, ct_pet));
     !record_missing_data(Case).

+!record_missing_data(Case)
  : unavailable(Case, pet) & not missing_data(Case, pet)
  <- +missing_data(Case, pet);
     .send(runtime_coordinator, tell, missing_data(Case, pet));
     !record_missing_data(Case).

+!record_missing_data(Case)
  <- true.

+!check_runtime_review(Case)
  : not usable_case_data(Case)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, missing_critical_data));
     !check_runtime_review_done(Case).

+!check_runtime_review(Case)
  : ct_level(Case, gray_zone) & unavailable(Case, pet)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, missing_pet_parameters));
     !check_runtime_review_done(Case).

+!check_runtime_review(Case)
  <- true.

+!check_runtime_review_done(Case)
  <- true.

+!check_rule_approval(Case)
  <- .findall(Rule, activated_rule(Case, Rule), Rules);
     !check_approval_list(Case, Rules).

+!check_approval_list(Case, [])
  <- true.

+!check_approval_list(Case, [Rule|Rest])
  : approved_rule(Rule)
  <- !check_approval_list(Case, Rest).

+!check_approval_list(Case, [Rule|Rest])
  : not approved_rule(Rule)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, unapproved_rule_activated));
     !check_approval_list(Case, Rest).

+!emit_sources_for_activated_rules(Case)
  <- .findall(Rule, activated_rule(Case, Rule), Rules);
     !emit_source_list(Case, Rules).

+!emit_source_list(Case, [])
  <- true.

+!emit_source_list(Case, [Rule|Rest])
  : source_for_rule(Rule, Source)
  <- .send(runtime_coordinator, tell, source_trace(Case, Source));
     !emit_source_list(Case, Rest).

+!emit_source_list(Case, [Rule|Rest])
  : not source_for_rule(Rule, Source)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, missing_source_grounding));
     !emit_source_list(Case, Rest).

+!check_conflicts(Case)
  : risk(Case, high) & risk(Case, low)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, conflicting_risk_conclusions)).

+!check_conflicts(Case)
  : risk(Case, high) & risk(Case, unknown)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, conflicting_risk_conclusions)).

+!check_conflicts(Case)
  : risk(Case, low) & risk(Case, unknown)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, conflicting_risk_conclusions)).

+!check_conflicts(Case)
  <- true.

+!check_low_risk_safety(Case)
  : risk(Case, low) & not usable_case_data(Case)
  <- .send(runtime_coordinator, tell, requires_human_review(Case, unsafe_low_risk_without_evidence)).

+!check_low_risk_safety(Case)
  <- true.
