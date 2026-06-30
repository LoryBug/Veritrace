export type ParsedFact = {
  kind: 'fact'
  source: string
  predicate: string
  args: string[]
  arity: number
}

export type ParsedExpression = {
  kind: 'expression'
  source: string
  left: string
  operator: string
  right: string
}

export type ParsedNegation = {
  kind: 'negation'
  source: string
  fragment: LogicFragment
}

export type ParsedRaw = {
  kind: 'raw'
  source: string
}

export type LogicFragment = ParsedFact | ParsedExpression | ParsedNegation | ParsedRaw

const comparisonOperators = ['>=', '<=', '!=', '==', '>', '<', '=']

export function parseLogicFragment(value: string): LogicFragment {
  const source = value.trim().replace(/\.$/, '')
  if (!source) return { kind: 'raw', source: value }

  if (source.startsWith('not ')) {
    return {
      kind: 'negation',
      source,
      fragment: parseLogicFragment(source.slice(4)),
    }
  }

  const fact = parseFact(source)
  if (fact) return fact

  const expression = parseExpression(source)
  if (expression) return expression

  return { kind: 'raw', source }
}

export function parseFact(source: string): ParsedFact | null {
  const match = source.match(/^([a-z][A-Za-z0-9_]*)\((.*)\)$/)
  if (!match || !hasBalancedDelimiters(match[2])) return null

  const args = splitTopLevel(match[2], ',').map((arg) => arg.trim()).filter(Boolean)
  return {
    kind: 'fact',
    source,
    predicate: match[1],
    args,
    arity: args.length,
  }
}

function parseExpression(source: string): ParsedExpression | null {
  for (const operator of comparisonOperators) {
    const index = findTopLevelOperator(source, operator)
    if (index === -1) continue

    const left = source.slice(0, index).trim()
    const right = source.slice(index + operator.length).trim()
    if (!left || !right) continue

    return { kind: 'expression', source, left, operator, right }
  }

  return null
}

function findTopLevelOperator(source: string, operator: string) {
  let depth = 0
  for (let index = 0; index <= source.length - operator.length; index += 1) {
    const char = source[index]
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth === 0 && source.slice(index, index + operator.length) === operator) return index
  }
  return -1
}

export function splitTopLevel(source: string, delimiter: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === delimiter && depth === 0) {
      parts.push(source.slice(start, index))
      start = index + 1
    }
  }

  parts.push(source.slice(start))
  return parts
}

function hasBalancedDelimiters(source: string) {
  let depth = 0
  for (const char of source) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

export function isVariable(value: string) {
  return /^[A-Z_]/.test(value.trim())
}

export function labelAtom(value: string) {
  const normalized = value.trim()
  if (isVariable(normalized)) return normalized
  return normalized.replace(/_/g, ' ')
}
