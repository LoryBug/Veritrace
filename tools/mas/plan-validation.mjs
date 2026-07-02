import { parsePredicate } from './rule-validation.mjs'

export function validateRuntimePlan(plan, file = '<plan>') {
  const errors = []

  requireObject(plan, file, errors)
  if (errors.length > 0) return errors

  requireString(plan, 'planId', file, errors, { identifier: true })
  requireString(plan, 'domain', file, errors)
  requireString(plan, 'title', file, errors)
  requireLiteral(plan, 'reviewStatus', 'approved', file, errors)
  requireLiteral(plan, 'approvedForRuntime', true, file, errors)
  validateSource(plan.source, file, errors)
  validateTrigger(plan.trigger, file, errors)
  requireString(plan, 'planningGoal', file, errors, { identifier: true })
  validateIdentifierArray(plan.nextSteps, 'nextSteps', file, errors)
  validateRuntimeImplementation(plan.runtimeImplementation, file, errors)
  validateStringArray(plan.validatedBy ?? [], 'validatedBy', file, errors, { required: false })
  validateStringArray(plan.limitations ?? [], 'limitations', file, errors, { required: false })

  const triggerFact = parsePredicate(plan.runtimeImplementation?.triggerFact ?? '')
  if (triggerFact?.name !== 'decision' || triggerFact.args[1] !== plan.trigger?.decision) {
    errors.push(`${file}: runtimeImplementation.triggerFact must be decision(Case, ${plan.trigger?.decision ?? 'Decision'})`)
  }

  const approvedPlanFact = parsePredicate(plan.runtimeImplementation?.approvedPlanFact ?? '')
  if (approvedPlanFact?.name !== 'approved_plan' || approvedPlanFact.args[0] !== plan.planId) {
    errors.push(`${file}: runtimeImplementation.approvedPlanFact must be approved_plan(${plan.planId})`)
  }

  return errors
}

export function shouldCompilePlan(plan) {
  return plan?.reviewStatus === 'approved' && plan?.approvedForRuntime === true
}

export function throwIfInvalidRuntimePlan(plan, file = '<plan>') {
  const errors = validateRuntimePlan(plan, file)
  if (errors.length > 0) throw new Error(errors.join('\n'))
}

function requireObject(value, file, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${file}: plan must be a JSON object`)
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

function validateTrigger(trigger, file, errors) {
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
    errors.push(`${file}: trigger must be an object`)
    return
  }
  requireString(trigger, 'decision', `${file}.trigger`, errors, { identifier: true })
}

function validateRuntimeImplementation(implementation, file, errors) {
  if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)) {
    errors.push(`${file}: runtimeImplementation must be an object`)
    return
  }
  requireString(implementation, 'agentFile', `${file}.runtimeImplementation`, errors)
  requireString(implementation, 'triggerFact', `${file}.runtimeImplementation`, errors)
  requireString(implementation, 'approvedPlanFact', `${file}.runtimeImplementation`, errors)
}

function validateIdentifierArray(value, field, file, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${file}: ${field} must be a non-empty array`)
    return
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !isIdentifier(item)) errors.push(`${file}: ${field}[${index}] must be a lowercase AgentSpeak identifier`)
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

function isIdentifier(value) {
  return /^[a-z][A-Za-z0-9_]*$/.test(value)
}
