// Diagnostic actions and planning goals used by the agent.

clinical_action(perform_cmr).
clinical_action(perform_pet_ct).
clinical_action(review_images).
clinical_action(heart_team_discussion).
clinical_action(staging_or_histological_assessment).
clinical_action(follow_up_if_clinically_indicated).
clinical_action(consider_cmr).
clinical_action(collect_minimum_required_data).

goal(resolve_discordance).
goal(increase_diagnostic_confidence).
goal(complete_staging).
goal(obtain_tissue_diagnosis_if_needed).
goal(make_missing_data_explicit).
goal(maintain_clinical_review).
