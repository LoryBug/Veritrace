// Auto-generated from approved/rules/*.json.
// DO NOT EDIT MANUALLY - run `node tools/mas/compile-rules.mjs` instead.

// Rule: critical_data_missing
+!evaluate_case(Case)
  : not usable_case_data(Case) & approved_rule(critical_data_missing)
  <- !emit_conclusion(Case, unknown, insufficient_data, critical_data_missing);
     .send(runtime_coordinator, tell, reasoner_done(Case)).

// Rule: ct_gray_zone_without_pet
+!evaluate_case(Case)
  : ct_level(Case, gray_zone) & unavailable(Case, pet) & approved_rule(ct_gray_zone_without_pet)
  <- !emit_conclusion(Case, mid, cardiac_ct_gray_zone, ct_gray_zone_without_pet);
     !emit_evidence(Case, ct_level(Case, gray_zone));
     !emit_evidence(Case, unavailable(Case, pet));
     .send(runtime_coordinator, tell, reasoner_done(Case)).

// Rule: cmr_mass_score_above_cutoff
+!evaluate_case(Case)
  : score(Case, cmr_mass_score, Score) & cutoff(cmr_mass_score, Cutoff) & Score >= Cutoff & approved_rule(cmr_mass_score_above_cutoff)
  <- !emit_conclusion(Case, high, cmr_driven_high_suspicion, cmr_mass_score_above_cutoff);
     !emit_evidence(Case, score(Case, cmr_mass_score, Score));
     .send(runtime_coordinator, tell, reasoner_done(Case)).
