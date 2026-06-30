import { labelAtom, parseLogicFragment } from './facts'
import type { LogicFragment, ParsedFact } from './facts'

export type PredicateCategory = 'case_input' | 'static_knowledge' | 'derived' | 'conclusion' | 'trace' | 'meta'

export type PredicateArgument = {
  name: string
  role: 'case' | 'enum' | 'number' | 'boolean' | 'atom' | 'term'
  hidden?: boolean
}

export type PredicateDefinition = {
  predicate: string
  arity: number
  category: PredicateCategory
  label: string
  template: string
  args: PredicateArgument[]
}

export type FragmentExplanation = {
  source: string
  summary: string
  status: 'known' | 'unknown'
  kind: LogicFragment['kind']
  predicate?: string
  arity?: number
  category?: PredicateCategory
  label?: string
}

export const predicateVocabulary: PredicateDefinition[] = [
  {
    predicate: 'case',
    arity: 1,
    category: 'case_input',
    label: 'Case identifier',
    template: 'Case {caseId} exists.',
    args: [{ name: 'caseId', role: 'case' }],
  },
  {
    predicate: 'available',
    arity: 2,
    category: 'case_input',
    label: 'Available data',
    template: '{modality} is available for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'modality', role: 'enum' }],
  },
  {
    predicate: 'unavailable',
    arity: 2,
    category: 'case_input',
    label: 'Unavailable data',
    template: '{modality} is unavailable for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'modality', role: 'enum' }],
  },
  {
    predicate: 'score',
    arity: 3,
    category: 'case_input',
    label: 'Numeric score',
    template: '{metric} score is {value} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'metric', role: 'enum' }, { name: 'value', role: 'number' }],
  },
  {
    predicate: 'observed',
    arity: 3,
    category: 'case_input',
    label: 'Observation',
    template: '{finding} is observed in {modality} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'modality', role: 'enum' }, { name: 'finding', role: 'enum' }],
  },
  {
    predicate: 'ct_level',
    arity: 2,
    category: 'case_input',
    label: 'Categorical level',
    template: 'CT level is {level} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'level', role: 'enum' }],
  },
  {
    predicate: 'pet_positive',
    arity: 1,
    category: 'case_input',
    label: 'Boolean finding',
    template: 'PET is positive for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }],
  },
  {
    predicate: 'cutoff',
    arity: 2,
    category: 'static_knowledge',
    label: 'Static cutoff',
    template: '{metric} cutoff is {cutoff}.',
    args: [{ name: 'metric', role: 'enum' }, { name: 'cutoff', role: 'number' }],
  },
  {
    predicate: 'approved_rule',
    arity: 1,
    category: 'meta',
    label: 'Approved runtime rule',
    template: 'Rule {ruleId} is approved runtime knowledge.',
    args: [{ name: 'ruleId', role: 'atom' }],
  },
  {
    predicate: 'source_for_rule',
    arity: 2,
    category: 'meta',
    label: 'Rule source mapping',
    template: 'Rule {ruleId} is grounded in source {sourceId}.',
    args: [{ name: 'ruleId', role: 'atom' }, { name: 'sourceId', role: 'atom' }],
  },
  {
    predicate: 'risk',
    arity: 2,
    category: 'conclusion',
    label: 'Risk conclusion',
    template: 'Runtime sets risk to {level} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'level', role: 'enum' }],
  },
  {
    predicate: 'decision',
    arity: 2,
    category: 'conclusion',
    label: 'Decision conclusion',
    template: 'Runtime emits decision {decision} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'decision', role: 'enum' }],
  },
  {
    predicate: 'activated_rule',
    arity: 2,
    category: 'trace',
    label: 'Activated rule trace',
    template: 'Runtime records rule {ruleId} as activated for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'ruleId', role: 'atom' }],
  },
  {
    predicate: 'used_evidence',
    arity: 2,
    category: 'trace',
    label: 'Used evidence trace',
    template: 'Runtime records evidence {evidence} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'evidence', role: 'term' }],
  },
  {
    predicate: 'missing_data',
    arity: 2,
    category: 'trace',
    label: 'Missing data trace',
    template: 'Runtime records missing data {data} for {caseId}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'data', role: 'atom' }],
  },
  {
    predicate: 'requires_human_review',
    arity: 2,
    category: 'trace',
    label: 'Human review trace',
    template: 'Runtime requires human review for {caseId}: {reason}.',
    args: [{ name: 'caseId', role: 'case' }, { name: 'reason', role: 'atom' }],
  },
]

const vocabularyBySignature = new Map(predicateVocabulary.map((definition) => [signature(definition.predicate, definition.arity), definition]))

export function explainFragment(source: string): FragmentExplanation {
  const fragment = parseLogicFragment(source)

  if (fragment.kind === 'fact') return explainFact(fragment)

  if (fragment.kind === 'expression') {
    return {
      source: fragment.source,
      summary: `${labelAtom(fragment.left)} ${explainOperator(fragment.operator)} ${labelAtom(fragment.right)}.`,
      status: 'known',
      kind: 'expression',
      label: 'Comparison expression',
      category: 'derived',
    }
  }

  if (fragment.kind === 'negation') {
    const nested = explainFragment(fragment.fragment.source)
    return {
      source: fragment.source,
      summary: `No matching fact is present: ${nested.summary}`,
      status: nested.status,
      kind: 'negation',
      predicate: nested.predicate,
      arity: nested.arity,
      category: nested.category,
      label: nested.label,
    }
  }

  return {
    source: fragment.source,
    summary: fragment.source,
    status: 'unknown',
    kind: 'raw',
    label: 'Raw logic fragment',
  }
}

export function getPredicateDefinition(predicate: string, arity: number) {
  return vocabularyBySignature.get(signature(predicate, arity))
}

function explainFact(fact: ParsedFact): FragmentExplanation {
  const definition = getPredicateDefinition(fact.predicate, fact.arity)
  if (!definition) {
    return {
      source: fact.source,
      summary: `${fact.predicate}/${fact.arity} with arguments ${fact.args.map(labelAtom).join(', ')}.`,
      status: 'unknown',
      kind: 'fact',
      predicate: fact.predicate,
      arity: fact.arity,
      label: 'Unknown predicate',
    }
  }

  return {
    source: fact.source,
    summary: renderTemplate(definition, fact.args),
    status: 'known',
    kind: 'fact',
    predicate: fact.predicate,
    arity: fact.arity,
    category: definition.category,
    label: definition.label,
  }
}

function renderTemplate(definition: PredicateDefinition, values: string[]) {
  return definition.args.reduce((rendered, arg, index) => {
    return rendered.replaceAll(`{${arg.name}}`, labelAtom(values[index] ?? ''))
  }, definition.template)
}

function explainOperator(operator: string) {
  if (operator === '>=') return 'is greater than or equal to'
  if (operator === '<=') return 'is less than or equal to'
  if (operator === '!=') return 'is not equal to'
  if (operator === '==') return 'is equal to'
  if (operator === '>') return 'is greater than'
  if (operator === '<') return 'is less than'
  return 'equals'
}

function signature(predicate: string, arity: number) {
  return `${predicate}/${arity}`
}
