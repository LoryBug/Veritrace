export const MISSING_DATA_BEHAVIORS = new Set([
  'do_not_assume_negative',
  'require_human_review',
  'not_applicable',
])

export function validateRuntimeRule(rule, file = '<rule>') {
  const errors = []

  requireObject(rule, file, errors)
  if (errors.length > 0) return errors

  requireString(rule, 'ruleId', file, errors, { identifier: true })
  requireString(rule, 'domain', file, errors)
  requireString(rule, 'title', file, errors)
  requireString(rule, 'ruleType', file, errors)
  requireLiteral(rule, 'reviewStatus', 'approved', file, errors)
  requireLiteral(rule, 'approvedForRuntime', true, file, errors)
  requireString(rule, 'missingDataBehavior', file, errors)

  if (rule.missingDataBehavior && !MISSING_DATA_BEHAVIORS.has(rule.missingDataBehavior)) {
    errors.push(`${file}: missingDataBehavior must be one of ${[...MISSING_DATA_BEHAVIORS].join(', ')}`)
  }

  validateSource(rule.source, file, errors)
  validateRuntimeImplementation(rule, file, errors)
  validateFragments(rule.conditions, 'conditions', file, errors, { allowComparison: true })
  validateFragments(rule.conclusions, 'conclusions', file, errors, { allowComparison: false })
  validateFragments(rule.usedEvidence ?? [], 'usedEvidence', file, errors, { allowComparison: true, required: false })
  validateStringArray(rule.validatedBy ?? [], 'validatedBy', file, errors, { required: false })
  validateStringArray(rule.limitations ?? [], 'limitations', file, errors, { required: false })
  validateCompilation(rule.compilation, file, errors)

  const risk = conclusionArg(rule, 'risk', 1)
  const decision = conclusionArg(rule, 'decision', 1)
  const activatedRule = conclusionArg(rule, 'activated_rule', 1)
  if (!risk) errors.push(`${file}: conclusions must include risk(Case, Risk)`)
  if (!decision) errors.push(`${file}: conclusions must include decision(Case, Decision)`)
  if (!activatedRule) errors.push(`${file}: conclusions must include activated_rule(Case, RuleId)`)
  if (activatedRule && activatedRule !== rule.ruleId) {
    errors.push(`${file}: activated_rule conclusion must match ruleId (${rule.ruleId})`)
  }

  const activatedRuleFact = parsePredicate(rule.runtimeImplementation?.activatedRuleFact ?? '')
  if (activatedRuleFact?.name !== 'activated_rule' || activatedRuleFact.args[1] !== rule.ruleId) {
    errors.push(`${file}: runtimeImplementation.activatedRuleFact must be activated_rule(Case, ${rule.ruleId})`)
  }

  const sourceMappingFact = parsePredicate(rule.runtimeImplementation?.sourceMappingFact ?? '')
  if (sourceMappingFact?.name !== 'source_for_rule' || sourceMappingFact.args[0] !== rule.ruleId) {
    errors.push(`${file}: runtimeImplementation.sourceMappingFact must be source_for_rule(${rule.ruleId}, SourceId)`)
  }
  if (sourceMappingFact?.args[1] && rule.source?.sourceId && sourceMappingFact.args[1] !== rule.source.sourceId) {
    errors.push(`${file}: sourceMappingFact source id must match source.sourceId (${rule.source.sourceId})`)
  }

  return errors
}

export function shouldCompileRule(rule) {
  return rule?.reviewStatus === 'approved' && rule?.approvedForRuntime === true
}

export function throwIfInvalidRuntimeRule(rule, file = '<rule>') {
  const errors = validateRuntimeRule(rule, file)
  if (errors.length > 0) throw new Error(errors.join('\n'))
}

export function conclusionArg(rule, predicateName, argIndex) {
  for (const conclusion of rule.conclusions ?? []) {
    const parsed = parsePredicate(conclusion)
    if (parsed?.name === predicateName) return parsed.args[argIndex]
  }
  return null
}

export function parsePredicate(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^([a-z][A-Za-z0-9_]*)\((.*)\)$/)
  if (!match) return null
  const args = splitTopLevel(match[2]).map((arg) => arg.trim())
  if (args.some((arg) => arg.length === 0)) return null
  return { name: match[1], args }
}

export function splitTopLevel(value) {
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

function requireObject(value, file, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${file}: rule must be a JSON object`)
  }
}

function requireString(object, field, file, errors, options = {}) {
  if (typeof object[field] !== 'string' || object[field].trim() === '') {
    errors.push(`${file}: ${field} must be a non-empty string`)
    return
  }
  if (options.identifier && !isIdentifier(object[field])) {
    errors.push(`${file}: ${field} must be a lowercase AgentSpeak identifier`)
  }
}

function requireLiteral(object, field, expected, file, errors) {
  if (object[field] !== expected) errors.push(`${file}: ${field} must be ${JSON.stringify(expected)}`)
}

function validateSource(source, file, errors) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    errors.push(`${file}: source must be an object`)
    return
  }
  requireString(source, 'sourceId', `${file}.source`, errors, { identifier: true })
  requireString(source, 'quote', `${file}.source`, errors)
}

function validateRuntimeImplementation(rule, file, errors) {
  const implementation = rule.runtimeImplementation
  if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)) {
    errors.push(`${file}: runtimeImplementation must be an object`)
    return
  }

  requireString(implementation, 'agentFile', `${file}.runtimeImplementation`, errors)
  requireString(implementation, 'activatedRuleFact', `${file}.runtimeImplementation`, errors)
  requireString(implementation, 'sourceMappingFact', `${file}.runtimeImplementation`, errors)
}

function validateFragments(value, field, file, errors, options = {}) {
  const required = options.required ?? true
  if (!Array.isArray(value)) {
    if (required) errors.push(`${file}: ${field} must be an array`)
    return
  }
  if (required && value.length === 0) errors.push(`${file}: ${field} must not be empty`)

  value.forEach((fragment, index) => {
    const error = validateAgentSpeakFragment(fragment, { allowComparison: options.allowComparison })
    if (error) errors.push(`${file}: ${field}[${index}] ${error}`)
  })
}

function validateStringArray(value, field, file, errors, options = {}) {
  const required = options.required ?? true
  if (!Array.isArray(value)) {
    if (required) errors.push(`${file}: ${field} must be an array`)
    return
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') errors.push(`${file}: ${field}[${index}] must be a non-empty string`)
  })
}

function validateCompilation(compilation, file, errors) {
  if (compilation === undefined) return
  if (!compilation || typeof compilation !== 'object' || Array.isArray(compilation)) {
    errors.push(`${file}: compilation must be an object when provided`)
    return
  }

  if (compilation.priority !== undefined && (!Number.isInteger(compilation.priority) || compilation.priority < 0)) {
    errors.push(`${file}: compilation.priority must be a non-negative integer`)
  }

  if (compilation.derivedPredicates === undefined) return
  if (!Array.isArray(compilation.derivedPredicates)) {
    errors.push(`${file}: compilation.derivedPredicates must be an array`)
    return
  }

  compilation.derivedPredicates.forEach((predicate, index) => {
    const prefix = `${file}: compilation.derivedPredicates[${index}]`
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
      errors.push(`${prefix} must be an object`)
      return
    }
    requireString(predicate, 'name', prefix, errors, { identifier: true })
    requireString(predicate, 'definition', prefix, errors)
    validateStringArray(predicate.usedByRuleIds, 'usedByRuleIds', prefix, errors)
    const definition = predicate.definition.endsWith('.') ? predicate.definition.slice(0, -1) : predicate.definition
    const parsed = parsePredicate(definition.split(':-')[0].trim())
    if (!parsed || parsed.name !== predicate.name) {
      errors.push(`${prefix}: definition head must define predicate ${predicate.name}`)
    }
  })
}

function validateAgentSpeakFragment(value, options = {}) {
  if (typeof value !== 'string') return 'must be a string'

  const fragment = value.trim()
  if (!fragment) return 'must not be empty'
  if (fragment.endsWith('.')) return 'must not end with a period'
  if (/["']/.test(fragment)) return 'must not contain quoted atoms'

  if (fragment.startsWith('not ')) return validateAgentSpeakFragment(fragment.slice(4).trim(), { allowComparison: false })

  if (isComparison(fragment)) {
    if (!options.allowComparison) return 'must be a predicate fragment, not a comparison'
    return validateComparison(fragment)
  }

  const predicate = parsePredicate(fragment)
  if (!predicate) return 'must be an AgentSpeak predicate or allowed comparison'
  if (!isIdentifier(predicate.name)) return 'predicate name must be a lowercase identifier'

  for (const arg of predicate.args) {
    if (!isValidTerm(arg)) return `has invalid term ${arg}`
  }

  return null
}

function isComparison(fragment) {
  return /\s(>=|=<|>|<|=)\s/.test(fragment)
}

function validateComparison(fragment) {
  const match = fragment.match(/^(.+?)\s(>=|=<|>|<|=)\s(.+)$/)
  if (!match) return 'has invalid comparison syntax'
  if (!isValidTerm(match[1].trim())) return `has invalid comparison left term ${match[1].trim()}`
  if (!isValidTerm(match[3].trim())) return `has invalid comparison right term ${match[3].trim()}`
  return null
}

function isValidTerm(value) {
  const term = value.trim()
  if (/^-?\d+(\.\d+)?$/.test(term)) return true
  if (/^[A-Z_][A-Za-z0-9_]*$/.test(term)) return true
  if (isIdentifier(term)) return true
  const predicate = parsePredicate(term)
  return Boolean(predicate && predicate.args.every(isValidTerm))
}

function isIdentifier(value) {
  return /^[a-z][A-Za-z0-9_]*$/.test(value)
}
