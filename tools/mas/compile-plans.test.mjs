import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COMPILE_PLANS = path.join(__dirname, 'compile-plans.mjs')

test('plan compiler emits AgentSpeak only for approved runtime plans', async () => {
  await withFixture(async (fixture) => {
    await writePlan(fixture.plansDir, 'valid.json', validPlan())
    await writePlan(fixture.plansDir, 'draft.json', {
      planId: 'draft_plan_ignored',
      reviewStatus: 'draft',
      approvedForRuntime: false,
    })

    const result = runCompiler(fixture)

    assert.equal(result.status, 0, result.stderr)
    const generatedPlanner = await readFile(fixture.generatedPlanner, 'utf8')
    const approvedPlans = await readFile(fixture.approvedPlansAsl, 'utf8')

    assert.match(generatedPlanner, /\/\/ Plan: valid_runtime_plan/)
    assert.match(generatedPlanner, /decision\(Case, demo_decision\)/)
    assert.match(generatedPlanner, /approved_plan\(valid_runtime_plan\)/)
    assert.match(generatedPlanner, /next_step\(Case, demo_step\)/)
    assert.doesNotMatch(generatedPlanner, /draft_plan_ignored/)
    assert.match(approvedPlans, /approved_plan\(valid_runtime_plan\)\./)
  })
})

test('plan compiler rejects invalid approved plans', async () => {
  await withFixture(async (fixture) => {
    await writePlan(fixture.plansDir, 'invalid.json', {
      ...validPlan(),
      nextSteps: ['Bad Step'],
    })

    const result = runCompiler(fixture)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /nextSteps\[0\].*lowercase AgentSpeak identifier/)
  })
})

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), 'traceability-plan-compiler-'))
  const fixture = {
    root,
    plansDir: path.join(root, 'plans'),
    generatedPlanner: path.join(root, 'out', 'care_planner_generated.asl'),
    approvedPlansAsl: path.join(root, 'out', 'approved_plans.asl'),
  }

  await mkdir(fixture.plansDir, { recursive: true })
  try {
    await callback(fixture)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writePlan(plansDir, file, plan) {
  await writeFile(path.join(plansDir, file), JSON.stringify(plan, null, 2), 'utf8')
}

function runCompiler(fixture) {
  return spawnSync(process.execPath, [
    COMPILE_PLANS,
    '--plans-dir', fixture.plansDir,
    '--generated-planner', fixture.generatedPlanner,
    '--approved-plans-asl', fixture.approvedPlansAsl,
  ], { encoding: 'utf8' })
}

function validPlan() {
  return {
    planId: 'valid_runtime_plan',
    domain: 'demo_domain',
    title: 'Valid runtime plan',
    reviewStatus: 'approved',
    approvedForRuntime: true,
    source: {
      sourceId: 'demo_source',
      quote: 'Demo source quote.',
    },
    trigger: {
      decision: 'demo_decision',
    },
    planningGoal: 'demo_goal',
    nextSteps: ['demo_step'],
    runtimeImplementation: {
      agentFile: 'agents/care_planner.asl',
      triggerFact: 'decision(Case, demo_decision)',
      approvedPlanFact: 'approved_plan(valid_runtime_plan)',
    },
    validatedBy: ['expected/traces/demo.expected.json'],
    limitations: ['Demo limitation.'],
    compilation: {
      priority: 50,
    },
  }
}
