// Auto-generated from approved/plans/*.json.
// DO NOT EDIT MANUALLY - run `node tools/mas/compile-plans.mjs` instead.

// Plan: gdpr_breach_notification_plan
+!plan_case(Case)
  : decision(Case, gdpr_breach_notification_overdue) & approved_plan(gdpr_breach_notification_plan)
  <- .send(runtime_coordinator, tell, planning_goal(Case, restore_breach_notification_compliance));
     .send(runtime_coordinator, tell, next_step(Case, notify_supervisory_authority));
     .send(runtime_coordinator, tell, next_step(Case, document_delay_reasons));
     .send(runtime_coordinator, tell, next_step(Case, dpo_review));
     .send(runtime_coordinator, tell, planner_done(Case)).

// Plan: gdpr_missing_legal_basis_plan
+!plan_case(Case)
  : decision(Case, gdpr_missing_legal_basis) & approved_plan(gdpr_missing_legal_basis_plan)
  <- .send(runtime_coordinator, tell, planning_goal(Case, restore_lawfulness));
     .send(runtime_coordinator, tell, next_step(Case, suspend_processing));
     .send(runtime_coordinator, tell, next_step(Case, document_or_obtain_legal_basis));
     .send(runtime_coordinator, tell, next_step(Case, dpo_review));
     .send(runtime_coordinator, tell, planner_done(Case)).

// Plan: gdpr_special_category_plan
+!plan_case(Case)
  : decision(Case, gdpr_special_category_without_exception) & approved_plan(gdpr_special_category_plan)
  <- .send(runtime_coordinator, tell, planning_goal(Case, restore_special_category_compliance));
     .send(runtime_coordinator, tell, next_step(Case, stop_special_category_processing));
     .send(runtime_coordinator, tell, next_step(Case, identify_article9_exception));
     .send(runtime_coordinator, tell, next_step(Case, dpo_review));
     .send(runtime_coordinator, tell, planner_done(Case)).

// Plan: gdpr_lawful_processing_plan
+!plan_case(Case)
  : decision(Case, gdpr_lawful_processing_documented) & approved_plan(gdpr_lawful_processing_plan)
  <- .send(runtime_coordinator, tell, planning_goal(Case, maintain_accountability));
     .send(runtime_coordinator, tell, next_step(Case, maintain_processing_record));
     .send(runtime_coordinator, tell, planner_done(Case)).
