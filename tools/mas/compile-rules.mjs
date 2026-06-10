#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { conclusionArg, parsePredicate, shouldCompileRule, throwIfInvalidRuntimeRule } from './rule-validation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_APPROVED_RULES_DIR = path.join(REPO_ROOT, 'approved/rules')
const DEFAULT_GENERATED_AGENT = path.join(REPO_ROOT, 'agents/case_reasoner_generated.asl')
const DEFAULT_APPROVED_RULES_ASL = path.join(REPO_ROOT, 'beliefs/approved_rules.asl')
const DEFAULT_APPROVED_RULE_SOURCES_ASL = path.join(REPO_ROOT, 'beliefs/approved_rule_sources.asl')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const paths = {
    approvedRulesDir: options.rulesDir ?? DEFAULT_APPROVED_RULES_DIR,
    generatedAgent: options.generatedAgent ?? DEFAULT_GENERATED_AGENT,
    approvedRulesAsl: options.approvedRulesAsl ?? DEFAULT_APPROVED_RULES_ASL,
    approvedRuleSourcesAsl: options.approvedRuleSourcesAsl ?? DEFAULT_APPROVED_RULE_SOURCES_ASL,
  }

  const rules = await loadRuntimeRules(paths.approvedRulesDir)
  if (rules.length === 0) {
    console.log('No approved runtime rules found')
    return
  }

  const sortedRules = [...rules].sort((a, b) => rulePriority(a) - rulePriority(b) || a.ruleId.localeCompare(b.ruleId))
  const derivedPredicates = collectDeclaredDerivedPredicates(sortedRules)

  await mkdir(path.dirname(paths.generatedAgent), { recursive: true })
  await mkdir(path.dirname(paths.approvedRulesAsl), { recursive: true })
  await mkdir(path.dirname(paths.approvedRuleSourcesAsl), { recursive: true })

  await writeFile(paths.generatedAgent, renderGeneratedAgent(sortedRules, derivedPredicates), 'utf8')
  await writeFile(paths.approvedRulesAsl, renderApprovedRules(sortedRules), 'utf8')
  await writeFile(paths.approvedRuleSourcesAsl, renderApprovedRuleSources(sortedRules), 'utf8')

  console.log(`Generated: ${path.relative(REPO_ROOT, paths.generatedAgent)}`)
  console.log(`Generated: ${path.relative(REPO_ROOT, paths.approvedRulesAsl)}`)
  console.log(`Generated: ${path.relative(REPO_ROOT, paths.approvedRuleSourcesAsl)}`)
}

async function loadRuntimeRules(approvedRulesDir) {
  const files = (await readdir(approvedRulesDir)).filter((file) => file.endsWith('.json')).sort()
  const rules = []

  for (const file of files) {
    const rulePath = path.join(approvedRulesDir, file)
    const rule = JSON.parse(await readFile(rulePath, 'utf8'))
    if (!shouldCompileRule(rule)) continue
    throwIfInvalidRuntimeRule(rule, path.relative(REPO_ROOT, rulePath))
    rules.push(rule)
  }

  return rules
}

function rulePriority(rule) {
  if (typeof rule.compilation?.priority === 'number') return rule.compilation.priority
  if (rule.ruleType === 'safety_guard') return 0
  if (rule.ruleType === 'missing_data_escalation') return 20
  if (rule.ruleType === 'threshold') return 50
  return 100
}

function collectDeclaredDerivedPredicates(rules) {
  const byName = new Map()

  for (const rule of rules) {
    for (const predicate of rule.compilation?.derivedPredicates ?? []) {
      const current = byName.get(predicate.name)
      if (!current) {
        byName.set(predicate.name, { ...predicate, usedByRuleIds: new Set(predicate.usedByRuleIds ?? [rule.ruleId]) })
      } else {
        for (const ruleId of predicate.usedByRuleIds ?? [rule.ruleId]) current.usedByRuleIds.add(ruleId)
      }
    }
  }

  return [...byName.values()]
    .filter((predicate) => predicate.usedByRuleIds.size >= 2)
    .map((predicate) => ({ ...predicate, usedByRuleIds: [...predicate.usedByRuleIds].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function renderGeneratedAgent(rules, derivedPredicates) {
  return `${[
    '// Auto-generated from approved/rules/*.json.',
    '// DO NOT EDIT MANUALLY - run `node tools/mas/compile-rules.mjs` instead.',
    '',
    ...renderDerivedPredicates(derivedPredicates),
    ...rules.flatMap(renderEvaluatePlan),
    '',
  ].join('\n').trimEnd()}\n`
}

function renderDerivedPredicates(derivedPredicates) {
  if (derivedPredicates.length === 0) return []

  const lines = ['// Shared derived predicates declared by approved rule JSON artifacts.']
  for (const predicate of derivedPredicates) {
    lines.push(`// Used by: ${predicate.usedByRuleIds.join(', ')}`)
    lines.push(predicate.definition.endsWith('.') ? predicate.definition : `${predicate.definition}.`)
    lines.push('')
  }
  return lines
}

function renderEvaluatePlan(rule) {
  const risk = conclusionArg(rule, 'risk', 1)
  const decision = conclusionArg(rule, 'decision', 1)
  const activatedRule = conclusionArg(rule, 'activated_rule', 1) ?? rule.ruleId

  if (!risk) throw new Error(`${rule.ruleId}: missing risk(Case, Risk) conclusion`)
  if (!decision) throw new Error(`${rule.ruleId}: missing decision(Case, Decision) conclusion`)
  if (activatedRule !== rule.ruleId) {
    throw new Error(`${rule.ruleId}: activated_rule conclusion must match ruleId`)
  }

  const condition = [...rule.conditions, `approved_rule(${rule.ruleId})`].join(' & ')
  const evidenceLines = (rule.usedEvidence ?? []).map((evidence) => `     !emit_evidence(Case, ${evidence});`)

  return [
    `// Rule: ${rule.ruleId}`,
    `+!evaluate_case(Case)`,
    `  : ${condition}`,
    `  <- !emit_conclusion(Case, ${risk}, ${decision}, ${rule.ruleId});`,
    ...evidenceLines,
    `     .send(runtime_coordinator, tell, reasoner_done(Case)).`,
    '',
  ]
}

function renderApprovedRules(rules) {
  return [
    '// Human-approved runtime rule metadata for the MAS golden-case scope.',
    '// Auto-generated from approved/rules/*.json.',
    '// DO NOT EDIT MANUALLY - run `node tools/mas/compile-rules.mjs` instead.',
    '',
    ...rules.map((rule) => `approved_rule(${rule.ruleId}).`),
    '',
  ].join('\n')
}

function renderApprovedRuleSources(rules) {
  return [
    '// Source mappings for human-approved runtime rules.',
    '// Auto-generated from approved/rules/*.json.',
    '// DO NOT EDIT MANUALLY - run `node tools/mas/compile-rules.mjs` instead.',
    '',
    ...rules.map((rule) => {
      const sourceId = sourceIdFor(rule)
      return `source_for_rule(${rule.ruleId}, ${sourceId}).`
    }),
    '',
  ].join('\n')
}

function sourceIdFor(rule) {
  const sourceMapping = rule.runtimeImplementation?.sourceMappingFact
  const parsed = sourceMapping ? parsePredicate(sourceMapping) : null
  if (parsed?.name === 'source_for_rule' && parsed.args[1]) return parsed.args[1]
  if (rule.source?.sourceId) return rule.source.sourceId
  throw new Error(`${rule.ruleId}: missing source mapping`)
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === '--rules-dir') {
      options.rulesDir = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--generated-agent') {
      options.generatedAgent = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--approved-rules-asl') {
      options.approvedRulesAsl = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--approved-rule-sources-asl') {
      options.approvedRuleSourcesAsl = path.resolve(value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

main().catch((err) => {
  console.error(`Compilation failed: ${err.message}`)
  process.exit(1)
})
