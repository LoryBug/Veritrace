// Auto-generated from approved/rules/*.json.
// DO NOT EDIT MANUALLY - run `node tools/mas/compile-rules.mjs` instead.

// Rule: critical_data_missing
+!evaluate_case(Case)
  : not usable_case_data(Case) & approved_rule(critical_data_missing)
  <- !emit_conclusion(Case, unknown, insufficient_data, critical_data_missing);
     .send(runtime_coordinator, tell, reasoner_done(Case)).

// Rule: gdpr_breach_notification_overdue
+!evaluate_case(Case)
  : data_breach(Case) & breach_risk(Case, likely) & breach_hours_since_awareness(Case, Hours) & Hours > 72 & not notified_authority(Case) & approved_rule(gdpr_breach_notification_overdue)
  <- !emit_conclusion(Case, high, gdpr_breach_notification_overdue, gdpr_breach_notification_overdue);
     !emit_evidence(Case, data_breach(Case));
     !emit_evidence(Case, breach_risk(Case, likely));
     !emit_evidence(Case, breach_hours_since_awareness(Case, Hours));
     .send(runtime_coordinator, tell, reasoner_done(Case)).

// Rule: gdpr_missing_legal_basis
+!evaluate_case(Case)
  : processing(Case) & personal_data(Case) & not legal_basis(Case, Basis) & approved_rule(gdpr_missing_legal_basis)
  <- !emit_conclusion(Case, high, gdpr_missing_legal_basis, gdpr_missing_legal_basis);
     !emit_evidence(Case, processing(Case));
     !emit_evidence(Case, personal_data(Case));
     .send(runtime_coordinator, tell, reasoner_done(Case)).

// Rule: gdpr_special_category_without_exception
+!evaluate_case(Case)
  : processing(Case) & special_category_data(Case, Category) & not article9_exception(Case, Exception) & approved_rule(gdpr_special_category_without_exception)
  <- !emit_conclusion(Case, high, gdpr_special_category_without_exception, gdpr_special_category_without_exception);
     !emit_evidence(Case, special_category_data(Case, Category));
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

// Rule: gdpr_lawful_processing_documented
+!evaluate_case(Case)
  : processing(Case) & personal_data(Case) & legal_basis(Case, Basis) & purpose_specified(Case) & transparency_notice(Case) & approved_rule(gdpr_lawful_processing_documented)
  <- !emit_conclusion(Case, low, gdpr_lawful_processing_documented, gdpr_lawful_processing_documented);
     !emit_evidence(Case, legal_basis(Case, Basis));
     !emit_evidence(Case, purpose_specified(Case));
     !emit_evidence(Case, transparency_notice(Case));
     .send(runtime_coordinator, tell, reasoner_done(Case)).
