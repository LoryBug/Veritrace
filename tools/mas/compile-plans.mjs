#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { shouldCompilePlan, throwIfInvalidRuntimePlan } from './plan-validation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_APPROVED_PLANS_DIR = path.join(REPO_ROOT, 'approved/plans')
const DEFAULT_GENERATED_PLANNER = path.join(REPO_ROOT, 'agents/care_planner_generated.asl')
const DEFAULT_APPROVED_PLANS_ASL = path.join(REPO_ROOT, 'beliefs/approved_plans.asl')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const paths = {
    approvedPlansDir: options.plansDir ?? DEFAULT_APPROVED_PLANS_DIR,
    generatedPlanner: options.generatedPlanner ?? DEFAULT_GENERATED_PLANNER,
    approvedPlansAsl: options.approvedPlansAsl ?? DEFAULT_APPROVED_PLANS_ASL,
  }

  const plans = await loadRuntimePlans(paths.approvedPlansDir)
  if (plans.length === 0) {
    console.log('No approved runtime plans found')
    return
  }

  const sortedPlans = [...plans].sort((a, b) => planPriority(a) - planPriority(b) || a.planId.localeCompare(b.planId))

  await mkdir(path.dirname(paths.generatedPlanner), { recursive: true })
  await mkdir(path.dirname(paths.approvedPlansAsl), { recursive: true })

  await writeFile(paths.generatedPlanner, renderGeneratedPlanner(sortedPlans), 'utf8')
  await writeFile(paths.approvedPlansAsl, renderApprovedPlans(sortedPlans), 'utf8')

  console.log(`Generated: ${path.relative(REPO_ROOT, paths.generatedPlanner)}`)
  console.log(`Generated: ${path.relative(REPO_ROOT, paths.approvedPlansAsl)}`)
}

async function loadRuntimePlans(approvedPlansDir) {
  const files = (await readdir(approvedPlansDir)).filter((file) => file.endsWith('.json')).sort()
  const plans = []

  for (const file of files) {
    const planPath = path.join(approvedPlansDir, file)
    const plan = JSON.parse(await readFile(planPath, 'utf8'))
    if (!shouldCompilePlan(plan)) continue
    throwIfInvalidRuntimePlan(plan, path.relative(REPO_ROOT, planPath))
    plans.push(plan)
  }

  return plans
}

function planPriority(plan) {
  if (typeof plan.compilation?.priority === 'number') return plan.compilation.priority
  return 100
}

function renderGeneratedPlanner(plans) {
  return `${[
    '// Auto-generated from approved/plans/*.json.',
    '// DO NOT EDIT MANUALLY - run `node tools/mas/compile-plans.mjs` instead.',
    '',
    ...plans.flatMap(renderPlanCasePlan),
    '',
  ].join('\n').trimEnd()}\n`
}

function renderPlanCasePlan(plan) {
  return [
    `// Plan: ${plan.planId}`,
    '+!plan_case(Case)',
    `  : decision(Case, ${plan.trigger.decision}) & approved_plan(${plan.planId})`,
    `  <- .send(runtime_coordinator, tell, activated_plan(Case, ${plan.planId}));`,
    `     .send(runtime_coordinator, tell, planning_goal(Case, ${plan.planningGoal}));`,
    ...plan.nextSteps.map((step) => `     .send(runtime_coordinator, tell, next_step(Case, ${step}));`),
    '     .send(runtime_coordinator, tell, planner_done(Case)).',
    '',
  ]
}

function renderApprovedPlans(plans) {
  return [
    '// Human-approved runtime plan metadata for the MAS golden-case scope.',
    '// Auto-generated from approved/plans/*.json.',
    '// DO NOT EDIT MANUALLY - run `node tools/mas/compile-plans.mjs` instead.',
    '',
    ...plans.map((plan) => `approved_plan(${plan.planId}).`),
    '',
  ].join('\n')
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === '--plans-dir') {
      options.plansDir = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--generated-planner') {
      options.generatedPlanner = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--approved-plans-asl') {
      options.approvedPlansAsl = path.resolve(value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

main().catch((err) => {
  console.error(`Plan compilation failed: ${err.message}`)
  process.exit(1)
})
