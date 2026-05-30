// Source identifiers reused by the Jason agent for explanations.

source(dem_score, paolisso_2022_dem_score).
source(cmr_mass_score, paolisso_2024_cmr_mass_score).
source(ct_pet_thresholds, dangelo_2020_ct_pet).
source(multimodality_workflow, angeli_2022_multimodality_context).
source(safety_behavior, local_safety_behavior).

source_for_rule(cmr_mass_score_above_cutoff, paolisso_2024_cmr_mass_score).
source_for_rule(dem_score_above_cutoff, paolisso_2022_dem_score).
source_for_rule(ct_gray_zone_without_pet, dangelo_2020_ct_pet).
source_for_rule(concordant_echo_cmr_high_suspicion, angeli_2022_multimodality_context).
source_for_rule(missing_cmr_after_positive_echo, local_safety_behavior).
source_for_rule(no_cutoff_exceeded, local_safety_behavior).
source_for_rule(critical_data_missing, local_safety_behavior).
