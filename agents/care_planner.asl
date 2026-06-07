// Care planner for the Jason MAS runtime.
// Owns BDI-style next-step planning from symbolic runtime conclusions.

{ include("beliefs/clinical_actions.asl") }

+!plan_case(Case)
  : decision(Case, insufficient_data)
  <- .send(runtime_coordinator, tell, planning_goal(Case, make_missing_data_explicit));
     .send(runtime_coordinator, tell, next_step(Case, collect_minimum_required_data));
     .send(runtime_coordinator, tell, planner_done(Case)).

+!plan_case(Case)
  : decision(Case, cardiac_ct_gray_zone)
  <- .send(runtime_coordinator, tell, planning_goal(Case, increase_diagnostic_confidence));
     .send(runtime_coordinator, tell, next_step(Case, perform_pet_ct));
     .send(runtime_coordinator, tell, next_step(Case, consider_cmr));
     .send(runtime_coordinator, tell, planner_done(Case)).

+!plan_case(Case)
  : risk(Case, high)
  <- .send(runtime_coordinator, tell, planning_goal(Case, complete_staging));
     .send(runtime_coordinator, tell, next_step(Case, heart_team_discussion));
     .send(runtime_coordinator, tell, next_step(Case, staging_or_histological_assessment));
     .send(runtime_coordinator, tell, planner_done(Case)).

+!plan_case(Case)
  : risk(Case, low)
  <- .send(runtime_coordinator, tell, planning_goal(Case, maintain_clinical_review));
     .send(runtime_coordinator, tell, next_step(Case, follow_up_if_clinically_indicated));
     .send(runtime_coordinator, tell, planner_done(Case)).

+!plan_case(Case)
  <- .send(runtime_coordinator, tell, planner_done(Case)).
