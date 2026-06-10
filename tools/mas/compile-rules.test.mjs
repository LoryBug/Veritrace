import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COMPILE_RULES = path.join(__dirname, 'compile-rules.mjs')

test('compiler emits AgentSpeak only for approved runtime rules', async () => {
  await withFixture(async (fixture) => {
    await writeRule(fixture.rulesDir, 'valid.json', validRule())
    await writeRule(fixture.rulesDir, 'draft.json', {
      ruleId: 'draft_rule_ignored',
      reviewStatus: 'draft',
      approvedForRuntime: false,
    })

    const result = runCompiler(fixture)

    assert.equal(result.status, 0, result.stderr)
    const generatedAgent = await readFile(fixture.generatedAgent, 'utf8')
    const approvedRules = await readFile(fixture.approvedRulesAsl, 'utf8')
    const approvedSources = await readFile(fixture.approvedRuleSourcesAsl, 'utf8')

    assert.match(generatedAgent, /\/\/ Rule: valid_runtime_rule/)
    assert.match(generatedAgent, /approved_rule\(valid_runtime_rule\)/)
    assert.match(generatedAgent, /!emit_conclusion\(Case, high, demo_decision, valid_runtime_rule\)/)
    assert.doesNotMatch(generatedAgent, /draft_rule_ignored/)
    assert.match(approvedRules, /approved_rule\(valid_runtime_rule\)\./)
    assert.doesNotMatch(approvedRules, /draft_rule_ignored/)
    assert.match(approvedSources, /source_for_rule\(valid_runtime_rule, demo_source\)\./)
  })
})

test('compiler rejects invalid AgentSpeak fragments', async () => {
  await withFixture(async (fixture) => {
    await writeRule(fixture.rulesDir, 'invalid-fragment.json', {
      ...validRule(),
      conditions: ['score(Case, "bad_atom", Score)', 'Score >= Cutoff'],
    })

    const result = runCompiler(fixture)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /conditions\[0\].*quoted atoms/)
  })
})

test('compiler rejects activated_rule mismatches', async () => {
  await withFixture(async (fixture) => {
    await writeRule(fixture.rulesDir, 'mismatch.json', {
      ...validRule(),
      conclusions: [
        'risk(Case, high)',
        'decision(Case, demo_decision)',
        'activated_rule(Case, another_rule)',
      ],
    })

    const result = runCompiler(fixture)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /activated_rule conclusion must match ruleId/)
  })
})

test('compiler rejects missing source mapping facts', async () => {
  await withFixture(async (fixture) => {
    const rule = validRule()
    delete rule.runtimeImplementation.sourceMappingFact
    await writeRule(fixture.rulesDir, 'missing-source-map.json', rule)

    const result = runCompiler(fixture)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /sourceMappingFact must be a non-empty string/)
  })
})

test('compiler sorts generated plans by priority before rule id', async () => {
  await withFixture(async (fixture) => {
    await writeRule(fixture.rulesDir, 'late.json', validRule({ ruleId: 'z_late_rule', priority: 50 }))
    await writeRule(fixture.rulesDir, 'early.json', validRule({ ruleId: 'a_early_rule', priority: 1 }))

    const result = runCompiler(fixture)

    assert.equal(result.status, 0, result.stderr)
    const generatedAgent = await readFile(fixture.generatedAgent, 'utf8')

    assert.ok(generatedAgent.indexOf('// Rule: a_early_rule') < generatedAgent.indexOf('// Rule: z_late_rule'))
  })
})

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), 'traceability-compiler-'))
  const fixture = {
    root,
    rulesDir: path.join(root, 'rules'),
    generatedAgent: path.join(root, 'out', 'case_reasoner_generated.asl'),
    approvedRulesAsl: path.join(root, 'out', 'approved_rules.asl'),
    approvedRuleSourcesAsl: path.join(root, 'out', 'approved_rule_sources.asl'),
  }

  await mkdir(fixture.rulesDir, { recursive: true })
  try {
    await callback(fixture)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writeRule(rulesDir, file, rule) {
  await writeFile(path.join(rulesDir, file), JSON.stringify(rule, null, 2), 'utf8')
}

function runCompiler(fixture) {
  return spawnSync(process.execPath, [
    COMPILE_RULES,
    '--rules-dir', fixture.rulesDir,
    '--generated-agent', fixture.generatedAgent,
    '--approved-rules-asl', fixture.approvedRulesAsl,
    '--approved-rule-sources-asl', fixture.approvedRuleSourcesAsl,
  ], { encoding: 'utf8' })
}

function validRule(options = {}) {
  const ruleId = options.ruleId ?? 'valid_runtime_rule'
  return {
    ruleId,
    domain: 'demo_domain',
    title: 'Valid runtime rule',
    ruleType: 'threshold',
    reviewStatus: 'approved',
    approvedForRuntime: true,
    source: {
      sourceId: 'demo_source',
      quote: 'Demo source quote.',
    },
    conditions: [
      'score(Case, demo_score, Score)',
      'cutoff(demo_score, Cutoff)',
      'Score >= Cutoff',
    ],
    conclusions: [
      'risk(Case, high)',
      'decision(Case, demo_decision)',
      `activated_rule(Case, ${ruleId})`,
    ],
    usedEvidence: ['score(Case, demo_score, Score)'],
    missingDataBehavior: 'do_not_assume_negative',
    runtimeImplementation: {
      agentFile: 'agents/case_reasoner.asl',
      activatedRuleFact: `activated_rule(Case, ${ruleId})`,
      sourceMappingFact: `source_for_rule(${ruleId}, demo_source)`,
    },
    validatedBy: ['expected/traces/demo.expected.json'],
    limitations: ['Demo limitation.'],
    compilation: {
      priority: options.priority ?? 50,
      derivedPredicates: [],
    },
  }
}
