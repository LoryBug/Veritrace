import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parsePredicate,
  splitTopLevel,
  shouldCompileRule,
  conclusionArg,
  validateRuntimeRule,
  throwIfInvalidRuntimeRule,
  MISSING_DATA_BEHAVIORS,
} from './rule-validation.mjs'

test('parsePredicate parses valid predicates', () => {
  const p = parsePredicate('risk(Case, high)')
  assert.deepEqual(p, { name: 'risk', args: ['Case', 'high'] })
})

test('parsePredicate handles nested terms', () => {
  const p = parsePredicate('score(Case, cmr_mass_score, Value)')
  assert.deepEqual(p, { name: 'score', args: ['Case', 'cmr_mass_score', 'Value'] })
})

test('parsePredicate handles zero args', () => {
  const p = parsePredicate('guardian_done()')
  assert.deepEqual(p, { name: 'guardian_done', args: [] })
})

test('parsePredicate returns null for non-string', () => {
  assert.equal(parsePredicate(42), null)
  assert.equal(parsePredicate(null), null)
  assert.equal(parsePredicate(undefined), null)
})

test('parsePredicate returns null for invalid format', () => {
  assert.equal(parsePredicate(''), null)
  assert.equal(parsePredicate('risk'), null)
  assert.equal(parsePredicate('risk()extra'), null)
  assert.equal(parsePredicate('1risk(Case)'), null)
  assert.equal(parsePredicate('Risk(Case)'), null)
})

test('splitTopLevel splits simple args', () => {
  assert.deepEqual(splitTopLevel('Case, high'), ['Case', ' high'])
})

test('splitTopLevel respects nested parentheses', () => {
  assert.deepEqual(splitTopLevel('score(Case, x), decision(Case, y)'), ['score(Case, x)', ' decision(Case, y)'])
})

test('splitTopLevel returns empty array for empty string', () => {
  assert.deepEqual(splitTopLevel(''), [])
})

test('splitTopLevel handles single value without comma', () => {
  assert.deepEqual(splitTopLevel('Case'), ['Case'])
})

test('shouldCompileRule returns true for approved runtime rules', () => {
  assert.equal(shouldCompileRule({ reviewStatus: 'approved', approvedForRuntime: true }), true)
})

test('shouldCompileRule returns false for drafts', () => {
  assert.equal(shouldCompileRule({ reviewStatus: 'draft', approvedForRuntime: false }), false)
})

test('shouldCompileRule returns false for non-approved', () => {
  assert.equal(shouldCompileRule({ reviewStatus: 'rejected', approvedForRuntime: false }), false)
})

test('shouldCompileRule returns false when approvedForRuntime is false', () => {
  assert.equal(shouldCompileRule({ reviewStatus: 'approved', approvedForRuntime: false }), false)
})

test('shouldCompileRule handles null/undefined gracefully', () => {
  assert.equal(shouldCompileRule(null), false)
  assert.equal(shouldCompileRule(undefined), false)
  assert.equal(shouldCompileRule({}), false)
})

test('conclusionArg extracts argument by predicate name', () => {
  const rule = {
    conclusions: [
      'risk(Case, high)',
      'decision(Case, demo_decision)',
      'activated_rule(Case, critical_data_missing)',
    ],
  }
  assert.equal(conclusionArg(rule, 'risk', 1), 'high')
  assert.equal(conclusionArg(rule, 'decision', 1), 'demo_decision')
  assert.equal(conclusionArg(rule, 'activated_rule', 1), 'critical_data_missing')
})

test('conclusionArg returns null for missing predicate', () => {
  assert.equal(conclusionArg({ conclusions: ['risk(Case, high)'] }, 'nonexistent', 0), null)
})

test('validateRuntimeRule passes a fully valid rule', () => {
  const errors = validateRuntimeRule(validRule())
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule passes on real critical_data_missing rule', () => {
  const errors = validateRuntimeRule(realRule('critical_data_missing'))
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule passes on real cmr_mass_score rule', () => {
  const errors = validateRuntimeRule(realRule('cmr_mass_score_above_cutoff'))
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule passes on real ct_gray_zone rule', () => {
  const errors = validateRuntimeRule(realRule('ct_gray_zone_without_pet'))
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule rejects null', () => {
  const errors = validateRuntimeRule(null)
  assert.ok(errors.some((e) => e.includes('must be a JSON object')))
})

test('validateRuntimeRule rejects missing ruleId', () => {
  const errors = validateRuntimeRule({ ...validRule(), ruleId: undefined })
  assert.ok(errors.some((e) => e.includes('ruleId')))
})

test('validateRuntimeRule rejects non-identifier ruleId', () => {
  const errors = validateRuntimeRule({ ...validRule(), ruleId: 'Bad-Rule-Id' })
  assert.ok(errors.some((e) => e.includes('identifier')))
})

test('validateRuntimeRule rejects non-approved reviewStatus', () => {
  const errors = validateRuntimeRule({ ...validRule(), reviewStatus: 'draft' })
  assert.ok(errors.some((e) => e.includes('reviewStatus')))
})

test('validateRuntimeRule rejects approvedForRuntime false', () => {
  const errors = validateRuntimeRule({ ...validRule(), approvedForRuntime: false })
  assert.ok(errors.some((e) => e.includes('approvedForRuntime')))
})

test('validateRuntimeRule rejects invalid missingDataBehavior', () => {
  const errors = validateRuntimeRule({ ...validRule(), missingDataBehavior: 'invalid_behavior' })
  assert.ok(errors.some((e) => e.includes('missingDataBehavior')))
})

test('validateRuntimeRule rejects missing source', () => {
  const errors = validateRuntimeRule({ ...validRule(), source: undefined })
  assert.ok(errors.some((e) => e.includes('source')))
})

test('validateRuntimeRule rejects missing source.sourceId', () => {
  const errors = validateRuntimeRule({ ...validRule(), source: { quote: 'test' } })
  assert.ok(errors.some((e) => e.includes('sourceId')))
})

test('validateRuntimeRule rejects missing runtimeImplementation', () => {
  const errors = validateRuntimeRule({ ...validRule(), runtimeImplementation: undefined })
  assert.ok(errors.some((e) => e.includes('runtimeImplementation')))
})

test('validateRuntimeRule rejects conditions with quoted atoms', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conditions: ['score(Case, "bad", Score)'],
  })
  assert.ok(errors.some((e) => e.includes('quoted atoms')))
})

test('validateRuntimeRule rejects conditions ending with period', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conditions: ['score(Case, x, Score).'],
  })
  assert.ok(errors.some((e) => e.includes('period')))
})

test('validateRuntimeRule rejects empty conditions', () => {
  const errors = validateRuntimeRule({ ...validRule(), conditions: [] })
  assert.ok(errors.some((e) => e.includes('conditions') && e.includes('empty')))
})

test('validateRuntimeRule rejects missing risk conclusion', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conclusions: ['decision(Case, x)', 'activated_rule(Case, test)'],
  })
  assert.ok(errors.some((e) => e.includes('risk(Case, Risk)')))
})

test('validateRuntimeRule rejects missing decision conclusion', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conclusions: ['risk(Case, high)', 'activated_rule(Case, test)'],
  })
  assert.ok(errors.some((e) => e.includes('decision(Case, Decision)')))
})

test('validateRuntimeRule rejects missing activated_rule conclusion', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conclusions: ['risk(Case, high)', 'decision(Case, x)'],
  })
  assert.ok(errors.some((e) => e.includes('activated_rule(Case, RuleId)')))
})

test('validateRuntimeRule rejects activated_rule mismatch', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conclusions: [
      'risk(Case, high)',
      'decision(Case, x)',
      'activated_rule(Case, wrong_rule_id)',
    ],
  })
  assert.ok(errors.some((e) => e.includes('activated_rule conclusion must match ruleId')))
})

test('validateRuntimeRule rejects conditions that are not an array', () => {
  const errors = validateRuntimeRule({ ...validRule(), conditions: 'not_an_array' })
  assert.ok(errors.some((e) => e.includes('conditions must be an array')))
})

test('validateRuntimeRule validates usedEvidence as optional', () => {
  const copy = { ...validRule() }
  delete copy.usedEvidence
  const errors = validateRuntimeRule(copy)
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule validates validatedBy as optional', () => {
  const copy = { ...validRule() }
  delete copy.validatedBy
  const errors = validateRuntimeRule(copy)
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule validates limitations as optional', () => {
  const copy = { ...validRule() }
  delete copy.limitations
  const errors = validateRuntimeRule(copy)
  assert.deepEqual(errors, [])
})

test('validateRuntimeRule checks sourceMappingFact matches source.sourceId', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    runtimeImplementation: {
      agentFile: 'agents/case_reasoner.asl',
      activatedRuleFact: 'activated_rule(Case, test_rule)',
      sourceMappingFact: 'source_for_rule(test_rule, wrong_source)',
    },
    source: { sourceId: 'correct_source', quote: 'test' },
  })
  assert.ok(errors.some((e) => e.includes('sourceMappingFact source id must match')))
})

test('validateRuntimeRule rejects invalid compilation.priority', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    compilation: { priority: -1 },
  })
  assert.ok(errors.some((e) => e.includes('priority')))
})

test('validateRuntimeRule rejects compilation.derivedPredicates without name', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    compilation: {
      derivedPredicates: [{ definition: 'some_derived(Case) :- score(Case, x, _)' }],
    },
  })
  assert.ok(errors.some((e) => e.includes('name')))
})

test('throwIfInvalidRuntimeRule throws on invalid rule', () => {
  assert.throws(() => throwIfInvalidRuntimeRule(null), /must be a JSON object/)
})

test('throwIfInvalidRuntimeRule does not throw on valid rule', () => {
  assert.doesNotThrow(() => throwIfInvalidRuntimeRule(validRule()))
})

test('validateAgentSpeakFragment rejects non-string fragments', () => {
  const errors = validateRuntimeRule({ ...validRule(), conditions: [42] })
  assert.ok(errors.some((e) => e.includes('must be a string')))
})

test('validateAgentSpeakFragment accepts not-fragments', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conditions: ['not usable_case_data(Case)'],
  })
  assert.deepEqual(errors, [])
})

test('validateAgentSpeakFragment rejects comparisons in conclusions', () => {
  const errors = validateRuntimeRule({
    ...validRule(),
    conclusions: [
      'risk(Case, high)',
      'decision(Case, x)',
      'activated_rule(Case, test_rule)',
      'Score >= Cutoff',
    ],
  })
  assert.ok(errors.some((e) => e.includes('must be a predicate fragment')))
})

test('parsePredicate handles comparison-like predicates', () => {
  assert.ok(parsePredicate('usable_case_data(Case)'))
  assert.ok(parsePredicate('guardian_done(Case)'))
  assert.ok(parsePredicate('planner_done(Case)'))
})

test('validateRuntimeRule uses custom file name in errors', () => {
  const errors = validateRuntimeRule(null, 'my_rules/test.json')
  assert.ok(errors[0].startsWith('my_rules/test.json'))
})

function validRule() {
  return {
    ruleId: 'test_rule',
    domain: 'test_domain',
    title: 'Test rule',
    ruleType: 'threshold',
    reviewStatus: 'approved',
    approvedForRuntime: true,
    source: {
      sourceId: 'test_source',
      quote: 'Test quote.',
    },
    conditions: [
      'score(Case, test_score, Score)',
      'cutoff(test_score, Cutoff)',
      'Score >= Cutoff',
    ],
    conclusions: [
      'risk(Case, high)',
      'decision(Case, test_decision)',
      'activated_rule(Case, test_rule)',
    ],
    usedEvidence: ['score(Case, test_score, Score)'],
    missingDataBehavior: 'do_not_assume_negative',
    runtimeImplementation: {
      agentFile: 'agents/case_reasoner.asl',
      activatedRuleFact: 'activated_rule(Case, test_rule)',
      sourceMappingFact: 'source_for_rule(test_rule, test_source)',
    },
    validatedBy: ['expected/traces/test.expected.json'],
    limitations: ['Test limitation.'],
    compilation: {
      priority: 50,
      derivedPredicates: [],
    },
  }
}

function realRule(name) {
  const rules = {
    critical_data_missing: {
      ruleId: 'critical_data_missing',
      domain: 'cardiac_mass',
      title: 'Critical case data missing',
      ruleType: 'safety_guard',
      reviewStatus: 'approved',
      approvedForRuntime: true,
      source: {
        sourceId: 'local_safety_behavior',
        quote: 'If no usable modality data are available, the runtime must mark the case as insufficient data rather than low risk.',
      },
      conditions: ['not usable_case_data(Case)'],
      conclusions: [
        'risk(Case, unknown)',
        'decision(Case, insufficient_data)',
        'activated_rule(Case, critical_data_missing)',
        'requires_human_review(Case, missing_critical_data)',
      ],
      usedEvidence: [],
      missingDataBehavior: 'require_human_review',
      runtimeImplementation: {
        agentFile: 'agents/case_reasoner.asl',
        activatedRuleFact: 'activated_rule(Case, critical_data_missing)',
        sourceMappingFact: 'source_for_rule(critical_data_missing, local_safety_behavior)',
      },
      validatedBy: ['expected/traces/gc00.expected.json'],
      limitations: [
        'This is a framework safety behavior, not a clinical conclusion.',
        'The rule prevents missing data from being interpreted as negative evidence.',
      ],
    },
    cmr_mass_score_above_cutoff: {
      ruleId: 'cmr_mass_score_above_cutoff',
      domain: 'cardiac_mass',
      title: 'CMR Mass Score above cutoff',
      ruleType: 'threshold',
      reviewStatus: 'approved',
      approvedForRuntime: true,
      source: {
        sourceId: 'paolisso_2024_cmr_mass_score',
        quote: 'CMR Mass Score cutoff >= 5 supports malignancy suspicion in cardiac mass evaluation.',
      },
      conditions: [
        'score(Case, cmr_mass_score, Score)',
        'cutoff(cmr_mass_score, Cutoff)',
        'Score >= Cutoff',
      ],
      conclusions: [
        'risk(Case, high)',
        'decision(Case, cmr_driven_high_suspicion)',
        'activated_rule(Case, cmr_mass_score_above_cutoff)',
      ],
      usedEvidence: ['score(Case, cmr_mass_score, Score)'],
      missingDataBehavior: 'do_not_assume_negative',
      runtimeImplementation: {
        agentFile: 'agents/case_reasoner.asl',
        activatedRuleFact: 'activated_rule(Case, cmr_mass_score_above_cutoff)',
        sourceMappingFact: 'source_for_rule(cmr_mass_score_above_cutoff, paolisso_2024_cmr_mass_score)',
      },
      validatedBy: ['expected/traces/gc04.expected.json'],
      limitations: [
        'This rule is part of a traceability case study, not a clinically validated decision rule.',
        'The rule does not infer low risk when CMR Mass Score is missing.',
      ],
    },
    ct_gray_zone_without_pet: {
      ruleId: 'ct_gray_zone_without_pet',
      domain: 'cardiac_mass',
      title: 'CT gray zone without PET',
      ruleType: 'threshold',
      reviewStatus: 'approved',
      approvedForRuntime: true,
      source: {
        sourceId: 'dangelo_2020_ct_pet',
        quote: 'CT gray zone findings require PET/CT correlation for accurate cardiac mass characterization.',
      },
      conditions: [
        'ct_level(Case, gray_zone)',
        'not pet_positive(Case)',
      ],
      conclusions: [
        'risk(Case, mid)',
        'decision(Case, cardiac_ct_gray_zone)',
        'activated_rule(Case, ct_gray_zone_without_pet)',
      ],
      usedEvidence: ['ct_level(Case, gray_zone)'],
      missingDataBehavior: 'do_not_assume_negative',
      runtimeImplementation: {
        agentFile: 'agents/case_reasoner.asl',
        activatedRuleFact: 'activated_rule(Case, ct_gray_zone_without_pet)',
        sourceMappingFact: 'source_for_rule(ct_gray_zone_without_pet, dangelo_2020_ct_pet)',
      },
      validatedBy: ['expected/traces/gc_gray_zone.expected.json'],
      limitations: [
        'This rule is part of a traceability case study, not a clinically validated decision rule.',
      ],
    },
  }
  const rule = rules[name]
  return { ...rule, compilation: { priority: 50, derivedPredicates: [] } }
}
