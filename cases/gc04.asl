// GC-04: CMR-driven high suspicion.
// Expected behavior: high risk, CMR Mass Score above cutoff, Heart Team/staging plan.

case(gc04).

unavailable(gc04, echo).
available(gc04, cmr).
unavailable(gc04, ct_pet).
unavailable(gc04, pet).

observed(gc04, cmr, infiltration).
observed(gc04, cmr, first_pass_perfusion).
observed(gc04, cmr, heterogeneous_enhancement).

score(gc04, cmr_mass_score, 5).
cutoff(cmr_mass_score, 5).

source(cmr_mass_score, paolisso_2024_cmr_mass_score).
