// Case reasoner for the Jason MAS runtime.
// Owns approved domain-rule execution: risk, decision, activated rules, evidence.

{ include("beliefs/cutoffs.asl") }
{ include("beliefs/approved_rules.asl") }
{ include("cases/gc00.asl") }
{ include("cases/gc04.asl") }
{ include("cases/gc_gray_zone.asl") }
{ include("cases/gdpr_lawful_processing.asl") }
{ include("cases/gdpr_missing_legal_basis.asl") }
{ include("cases/gdpr_special_category.asl") }
{ include("cases/gdpr_breach_overdue.asl") }

usable_case_data(Case) :-
    score(Case, Metric, Value).

usable_case_data(Case) :-
    observed(Case, Modality, Finding).

usable_case_data(Case) :-
    ct_level(Case, Level).

usable_case_data(Case) :-
    pet_positive(Case).

usable_case_data(Case) :-
    processing(Case).

usable_case_data(Case) :-
    data_breach(Case).

// Approved rule plans are generated from approved/rules/*.json.

+!emit_conclusion(Case, Risk, Decision, Rule)
  <- .send(runtime_coordinator, tell, risk(Case, Risk));
     .send(trace_guardian, tell, risk(Case, Risk));
     .send(care_planner, tell, risk(Case, Risk));
     .send(runtime_coordinator, tell, decision(Case, Decision));
     .send(trace_guardian, tell, decision(Case, Decision));
     .send(care_planner, tell, decision(Case, Decision));
     .send(runtime_coordinator, tell, activated_rule(Case, Rule));
     .send(trace_guardian, tell, activated_rule(Case, Rule)).

+!emit_evidence(Case, Evidence)
  <- .send(runtime_coordinator, tell, used_evidence(Case, Evidence)).

{ include("agents/case_reasoner_generated.asl") }
