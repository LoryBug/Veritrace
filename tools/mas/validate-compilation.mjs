#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const APPROVED_RULES_DIR = path.join(REPO_ROOT, 'approved/rules')
const APPROVED_PLANS_DIR = path.join(REPO_ROOT, 'approved/plans')
const GENERATED_AGENT = path.join(REPO_ROOT, 'agents/case_reasoner_generated.asl')
const GENERATED_PLANNER = path.join(REPO_ROOT, 'agents/care_planner_generated.asl')
const APPROVED_RULES_ASL = path.join(REPO_ROOT, 'beliefs/approved_rules.asl')
const APPROVED_RULE_SOURCES_ASL = path.join(REPO_ROOT, 'beliefs/approved_rule_sources.asl')
const APPROVED_PLANS_ASL = path.join(REPO_ROOT, 'beliefs/approved_plans.asl')

const failures = []

async function main() {
  const rules = await loadApprovedRules()
  const plans = await loadApprovedPlans()
  const generated = await readFile(GENERATED_AGENT, 'utf8')
  const generatedPlanner = await readFile(GENERATED_PLANNER, 'utf8')
  const approvedRules = await readFile(APPROVED_RULES_ASL, 'utf8')
  const approvedSources = await readFile(APPROVED_RULE_SOURCES_ASL, 'utf8')
  const approvedPlans = await readFile(APPROVED_PLANS_ASL, 'utf8')

  for (const rule of rules) {
    validateGeneratedPlan(rule, generated)
    validateApprovedRuleFact(rule, approvedRules)
    validateSourceMapping(rule, approvedSources)
  }

  for (const plan of plans) {
    validateGeneratedCarePlan(plan, generatedPlanner)
    validateApprovedPlanFact(plan, approvedPlans)
  }

  validateNoSuspiciousGeneratedPredicates(generated)

  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Compilation validation passed: ${rules.length} approved rules, ${plans.length} approved plans`)
}

async function loadApprovedRules() {
  const files = (await readdir(APPROVED_RULES_DIR)).filter((file) => file.endsWith('.json')).sort()
  const rules = []

  for (const file of files) {
    const rule = JSON.parse(await readFile(path.join(APPROVED_RULES_DIR, file), 'utf8'))
    if (rule.approvedForRuntime === true) rules.push(rule)
  }

  return rules
}

async function loadApprovedPlans() {
  const files = (await readdir(APPROVED_PLANS_DIR)).filter((file) => file.endsWith('.json')).sort()
  const plans = []

  for (const file of files) {
    const plan = JSON.parse(await readFile(path.join(APPROVED_PLANS_DIR, file), 'utf8'))
    if (plan.approvedForRuntime === true) plans.push(plan)
  }

  return plans
}

function validateGeneratedPlan(rule, generated) {
  const block = extractRuleBlock(rule.ruleId, generated)
  if (!block) {
    failures.push(`${rule.ruleId}: generated plan block not found`)
    return
  }

  for (const condition of rule.conditions) {
    if (!block.includes(condition)) failures.push(`${rule.ruleId}: condition missing from generated plan: ${condition}`)
  }

  if (!block.includes(`approved_rule(${rule.ruleId})`)) {
    failures.push(`${rule.ruleId}: missing approved_rule gating`)
  }

  const risk = conclusionArg(rule, 'risk', 1)
  const decision = conclusionArg(rule, 'decision', 1)
  const activatedRule = conclusionArg(rule, 'activated_rule', 1)
  const expectedEmit = `!emit_conclusion(Case, ${risk}, ${decision}, ${activatedRule})`
  if (!block.includes(expectedEmit)) failures.push(`${rule.ruleId}: missing emit_conclusion ${expectedEmit}`)

  for (const evidence of rule.usedEvidence ?? []) {
    const expectedEvidence = `!emit_evidence(Case, ${evidence})`
    if (!block.includes(expectedEvidence)) failures.push(`${rule.ruleId}: missing evidence emission ${expectedEvidence}`)
  }
}

function validateApprovedRuleFact(rule, approvedRules) {
  if (!approvedRules.includes(`approved_rule(${rule.ruleId}).`)) {
    failures.push(`${rule.ruleId}: missing approved_rule fact`)
  }
}

function validateSourceMapping(rule, approvedSources) {
  const sourceId = sourceIdFor(rule)
  const expected = `source_for_rule(${rule.ruleId}, ${sourceId}).`
  if (!approvedSources.includes(expected)) failures.push(`${rule.ruleId}: missing source mapping ${expected}`)
}

function validateGeneratedCarePlan(plan, generatedPlanner) {
  const block = extractPlanBlock(plan.planId, generatedPlanner)
  if (!block) {
    failures.push(`${plan.planId}: generated care plan block not found`)
    return
  }

  const trigger = `decision(Case, ${plan.trigger.decision})`
  if (!block.includes(trigger)) failures.push(`${plan.planId}: missing trigger ${trigger}`)
  if (!block.includes(`approved_plan(${plan.planId})`)) failures.push(`${plan.planId}: missing approved_plan gating`)

  const goal = `planning_goal(Case, ${plan.planningGoal})`
  if (!block.includes(goal)) failures.push(`${plan.planId}: missing planning goal ${goal}`)

  for (const step of plan.nextSteps) {
    const nextStep = `next_step(Case, ${step})`
    if (!block.includes(nextStep)) failures.push(`${plan.planId}: missing next step ${nextStep}`)
  }
}

function validateApprovedPlanFact(plan, approvedPlans) {
  if (!approvedPlans.includes(`approved_plan(${plan.planId}).`)) {
    failures.push(`${plan.planId}: missing approved_plan fact`)
  }
}

function extractRuleBlock(ruleId, generated) {
  const marker = `// Rule: ${ruleId}`
  const start = generated.indexOf(marker)
  if (start === -1) return null
  const next = generated.indexOf('\n// Rule:', start + marker.length)
  return next === -1 ? generated.slice(start) : generated.slice(start, next)
}

function extractPlanBlock(planId, generatedPlanner) {
  const marker = `// Plan: ${planId}`
  const start = generatedPlanner.indexOf(marker)
  if (start === -1) return null
  const next = generatedPlanner.indexOf('\n// Plan:', start + marker.length)
  return next === -1 ? generatedPlanner.slice(start) : generatedPlanner.slice(start, next)
}

function validateNoSuspiciousGeneratedPredicates(generated) {
  const suspicious = [
    /^score\(/m,
    /^cutoff\(/m,
    /^ct_level\(/m,
    /^unavailable\(/m,
  ]

  for (const pattern of suspicious) {
    if (pattern.test(generated)) failures.push(`generated file contains suspicious primitive predicate definition matching ${pattern}`)
  }
}

function conclusionArg(rule, predicateName, argIndex) {
  for (const conclusion of rule.conclusions) {
    const parsed = parsePredicate(conclusion)
    if (parsed?.name === predicateName) return parsed.args[argIndex]
  }
  return null
}

function sourceIdFor(rule) {
  const parsed = parsePredicate(rule.runtimeImplementation?.sourceMappingFact ?? '')
  if (parsed?.name === 'source_for_rule' && parsed.args[1]) return parsed.args[1]
  return rule.source?.sourceId
}

function parsePredicate(value) {
  const match = value.match(/^(\w+)\((.*)\)$/)
  if (!match) return null
  return {
    name: match[1],
    args: splitTopLevel(match[2]).map((arg) => arg.trim()),
  }
}

function splitTopLevel(value) {
  const parts = []
  let current = ''
  let depth = 0

  for (const char of value) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) parts.push(current)
  return parts
}

main().catch((err) => {
  console.error(`Compilation validation failed: ${err.message}`)
  process.exit(1)
})
