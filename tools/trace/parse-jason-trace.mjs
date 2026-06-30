#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [, , inputPath, outputPath] = process.argv

if (!inputPath || !outputPath) {
  console.error('Usage: node tools/trace/parse-jason-trace.mjs <jason-log.txt> <output-trace.json>')
  process.exit(1)
}

const keyMap = {
  TRACE_CASE: 'caseId',
  TRACE_RISK: 'risk',
  TRACE_DECISION: 'decision',
  TRACE_ACTIVATED_RULES: 'activatedRules',
  TRACE_USED_EVIDENCE: 'usedEvidence',
  TRACE_MISSING_DATA: 'missingData',
  TRACE_SOURCES: 'sources',
  TRACE_NEXT_STEPS: 'nextSteps',
  TRACE_HUMAN_REVIEW: 'humanReview',
}

const listKeys = new Set([
  'activatedRules',
  'usedEvidence',
  'missingData',
  'sources',
  'nextSteps',
  'humanReview',
])

const content = await readFile(inputPath, 'utf8')
const lines = content.split(/\r?\n/)
const begin = lines.findIndex((line) => line.includes('TRACE_EXPORT_BEGIN'))
const end = lines.findIndex((line, index) => index > begin && line.includes('TRACE_EXPORT_END'))

if (begin === -1 || end === -1) {
  throw new Error('Trace export delimiters not found in Jason log')
}

const trace = {
  caseId: '',
  risk: '',
  decision: '',
  activatedRules: [],
  usedEvidence: [],
  missingData: [],
  sources: [],
  nextSteps: [],
  humanReview: [],
}

for (const line of lines.slice(begin + 1, end)) {
  const match = line.match(/(TRACE_[A-Z_]+)=(.*)$/)
  if (!match) continue

  const [, rawKey, rawValue] = match
  const key = keyMap[rawKey]
  if (!key) continue

  const value = rawValue.trim()
  trace[key] = listKeys.has(key) ? parseJasonList(value) : value
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8')
console.log(`Trace written to ${path.normalize(outputPath)}`)

function parseJasonList(value) {
  if (value === '[]') return []
  if (!value.startsWith('[') || !value.endsWith(']')) return [value]

  const inner = value.slice(1, -1).trim()
  if (!inner) return []

  return splitTopLevel(inner).map((item) => normalizeJasonTerm(item.trim()))
}

function normalizeJasonTerm(value) {
  return value.replace(/,/g, ', ')
}

function splitTopLevel(value) {
  const items = []
  let current = ''
  let depth = 0

  for (const char of value) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1

    if (char === ',' && depth === 0) {
      items.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (current) items.push(current)
  return items
}
