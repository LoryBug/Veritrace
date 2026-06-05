// Baseline Jason/AgentSpeak scaffold.
// The first implementation should stay monagent until the ISE scope is confirmed.

// Shared cutoffs and source identifiers can be included or copied into the agent
// depending on the final Jason project layout.

// Example runtime goal for a loaded case:
// !evaluate(gc04).
// !plan_next_steps(gc04).
// !explain(gc04).
// !evaluate_and_export(gc04).

// Derived rules
cmr_positive(Case) :-
    score(Case, cmr_mass_score, Score) &
    cutoff(cmr_mass_score, Cutoff) &
    Score >= Cutoff.

dem_positive(Case) :-
    score(Case, dem_score, Score) &
    cutoff(dem_score, Cutoff) &
    Score >= Cutoff.

ct_pet_high_suspicion(Case) :-
    ct_level(Case, high).

ct_pet_high_suspicion(Case) :-
    ct_level(Case, gray_zone) &
    pet_positive(Case).

needs_second_level_imaging(Case) :-
    dem_positive(Case) &
    unavailable(Case, cmr).

missing_modality(Case, Modality) :-
    unavailable(Case, Modality).

usable_case_data(Case) :-
    score(Case, Metric, Value).

usable_case_data(Case) :-
    observed(Case, Modality, Finding).

usable_case_data(Case) :-
    ct_level(Case, Level).

usable_case_data(Case) :-
    pet_positive(Case).

// Evaluation plans
+!evaluate(Case)
  : not usable_case_data(Case)
  <- +risk(Case, unknown);
     +decision(Case, insufficient_data);
     +activated_rule(Case, critical_data_missing);
     +trace(Case, rule, critical_data_missing);
     +trace(Case, source, local_safety_behavior);
     +requires_human_review(Case, missing_critical_data);
     !record_missing_data(Case);
     !plan_next_steps(Case).

+!evaluate(Case)
  : cmr_positive(Case) & dem_positive(Case)
  <- +risk(Case, high);
     +decision(Case, concordant_high_suspicion_echo_cmr);
     +activated_rule(Case, concordant_echo_cmr_high_suspicion);
     +trace(Case, rule, concordant_echo_cmr_high_suspicion);
     +trace(Case, source, angeli_2022_multimodality_context);
     !record_missing_data(Case);
     !plan_next_steps(Case).

+!evaluate(Case)
  : score(Case, cmr_mass_score, Score) & cutoff(cmr_mass_score, Cutoff) & Score >= Cutoff
  <- +risk(Case, high);
     +decision(Case, cmr_driven_high_suspicion);
     +activated_rule(Case, cmr_mass_score_above_cutoff);
     +trace(Case, rule, cmr_mass_score_above_cutoff);
     +trace(Case, source, paolisso_2024_cmr_mass_score);
     +used_evidence(Case, score(Case, cmr_mass_score, Score));
     !record_missing_data(Case);
     !plan_next_steps(Case).

+!evaluate(Case)
  : needs_second_level_imaging(Case)
  <- +risk(Case, mid);
     +decision(Case, significant_echocardiographic_suspicion);
     +activated_rule(Case, dem_score_above_cutoff);
     +trace(Case, rule, dem_score_above_cutoff);
     +trace(Case, source, paolisso_2022_dem_score);
     !record_missing_data(Case);
     !plan_next_steps(Case).

+!evaluate(Case)
  : ct_level(Case, gray_zone) & unavailable(Case, pet)
  <- +risk(Case, mid);
     +decision(Case, cardiac_ct_gray_zone);
     +activated_rule(Case, ct_gray_zone_without_pet);
     +trace(Case, missing_data, pet_parameters_not_entered);
     +trace(Case, source, dangelo_2020_ct_pet);
     +used_evidence(Case, ct_level(Case, gray_zone));
     +used_evidence(Case, unavailable(Case, pet));
     +requires_human_review(Case, missing_pet_parameters);
     !record_missing_data(Case);
     !plan_next_steps(Case).

+!evaluate(Case)
  : usable_case_data(Case) & not cmr_positive(Case) & not dem_positive(Case) & not ct_pet_high_suspicion(Case)
  <- +risk(Case, low);
     +decision(Case, low_suspicion_with_available_data);
     +activated_rule(Case, no_cutoff_exceeded);
     +trace(Case, rule, no_cutoff_exceeded);
     +trace(Case, source, local_safety_behavior);
     !record_missing_data(Case);
     !plan_next_steps(Case).

// Missing-data trace helper
+!record_missing_data(Case)
  : unavailable(Case, echo) & not missing_data(Case, echo)
  <- +missing_data(Case, echo);
     +trace(Case, missing_data, echo);
     !record_missing_data(Case).

+!record_missing_data(Case)
  : unavailable(Case, cmr) & not missing_data(Case, cmr)
  <- +missing_data(Case, cmr);
     +trace(Case, missing_data, cmr);
     !record_missing_data(Case).

+!record_missing_data(Case)
  : unavailable(Case, ct_pet) & not missing_data(Case, ct_pet)
  <- +missing_data(Case, ct_pet);
     +trace(Case, missing_data, ct_pet);
     !record_missing_data(Case).

+!record_missing_data(Case)
  : unavailable(Case, pet) & not missing_data(Case, pet)
  <- +missing_data(Case, pet);
     +trace(Case, missing_data, pet);
     !record_missing_data(Case).

+!record_missing_data(Case)
  <- true.

// Planning plans
+!plan_next_steps(Case)
  : decision(Case, insufficient_data)
  <- +planning_goal(Case, make_missing_data_explicit);
     +next_step(Case, collect_minimum_required_data).

+!plan_next_steps(Case)
  : risk(Case, high)
  <- +planning_goal(Case, complete_staging);
     +next_step(Case, heart_team_discussion);
     +next_step(Case, staging_or_histological_assessment).

+!plan_next_steps(Case)
  : needs_second_level_imaging(Case)
  <- +planning_goal(Case, increase_diagnostic_confidence);
     +next_step(Case, perform_cmr).

+!plan_next_steps(Case)
  : decision(Case, cardiac_ct_gray_zone)
  <- +planning_goal(Case, increase_diagnostic_confidence);
     +next_step(Case, perform_pet_ct);
     +next_step(Case, consider_cmr).

+!plan_next_steps(Case)
  : risk(Case, low)
  <- +planning_goal(Case, maintain_clinical_review);
     +next_step(Case, follow_up_if_clinically_indicated).

// Explanation plans
+!explain(Case)
  : decision(Case, insufficient_data)
  <- .print("Decision: insufficient data");
     .print("Reason: no usable modality data were available.");
     .print("Safety behavior: missing data are not treated as negative evidence.").

+!explain(Case)
  : decision(Case, cmr_driven_high_suspicion)
  <- .print("Decision: CMR-driven high suspicion");
     .print("Reason: CMR Mass Score reached the cutoff.");
     .print("Source: Paolisso et al. 2024 CMR Mass Score.").

+!explain(Case)
  : decision(Case, significant_echocardiographic_suspicion)
  <- .print("Decision: significant echocardiographic suspicion");
     .print("Reason: DEM Score reached cutoff and CMR is unavailable.");
     .print("Plan: perform cardiac CMR if available.").

+!missing_data(Case)
  : missing_modality(Case, Modality)
  <- .print("Missing modality: ", Modality).

+!summarize_trace(Case)
  : risk(Case, Risk) & decision(Case, Decision)
  <- .print("Case: ", Case);
     .print("Risk: ", Risk);
     .print("Decision: ", Decision).

// Trace export plans
// These plans emit a delimited trace format that can be converted to JSON by tools/trace/parse-jason-trace.mjs.
+!evaluate_and_export(Case)
  <- !evaluate(Case);
     !export_trace(Case).

+!export_trace(Case)
  : risk(Case, Risk) & decision(Case, Decision)
  <- .findall(Rule, activated_rule(Case, Rule), Rules);
     .findall(Evidence, used_evidence(Case, Evidence), EvidenceList);
     .findall(Missing, missing_data(Case, Missing), MissingData);
     .findall(Source, trace(Case, source, Source), Sources);
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
     .print("TRACE_EXPORT_END").
