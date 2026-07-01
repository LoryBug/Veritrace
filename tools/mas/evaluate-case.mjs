#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const coordinatorPath = path.join(repoRoot, 'agents/runtime_coordinator.asl')
const caseReasonerPath = path.join(repoRoot, 'agents/case_reasoner.asl')
const traceGuardianPath = path.join(repoRoot, 'agents/trace_guardian.asl')
const logPropertiesPath = path.join(repoRoot, 'logging.properties')

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node tools/mas/evaluate-case.mjs <case-input.json|->')
  process.exit(1)
}

const input = JSON.parse(await readInput(inputPath))
const caseId = validateCaseId(input.caseId)
const facts = normalizeFacts(input.facts, caseId)
const runtimeDir = path.join(repoRoot, 'output/runtime', caseId)
const caseFactsPath = path.join(runtimeDir, 'case.asl')
const tracePath = path.join(runtimeDir, 'trace.json')
const includePath = `output/runtime/${caseId}/case.asl`

const originalCoordinator = await readFile(coordinatorPath, 'utf8')
const originalCaseReasoner = await readFile(caseReasonerPath, 'utf8')
const originalTraceGuardian = await readFile(traceGuardianPath, 'utf8')

try {
  await mkdir(runtimeDir, { recursive: true })
  await writeFile(caseFactsPath, `${facts.map((fact) => `${fact}.`).join('\n')}\n`, 'utf8')

  await writeFile(coordinatorPath, setCaseGoal(originalCoordinator, caseId), 'utf8')
  await writeFile(caseReasonerPath, addCaseInclude(originalCaseReasoner, includePath), 'utf8')
  await writeFile(traceGuardianPath, addCaseInclude(originalTraceGuardian, includePath), 'utf8')

  const runtimeClasspath = await resolveRuntimeClasspath()
  const run = await runJasonMas(runtimeClasspath)
  const trace = parseTrace([...run.stdout.split(/\r?\n/), ...run.stderr.split(/\r?\n/)])
  if (run.timedOut) trace.humanReview.push('runtime_timeout')

  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({
    mode: 'jason_live_case',
    caseId,
    inputFacts: facts,
    trace,
    outputDir: path.relative(repoRoot, runtimeDir).replace(/\\/g, '/'),
    tracePath: path.relative(repoRoot, tracePath).replace(/\\/g, '/'),
  }, null, 2)}\n`)
} finally {
  await writeFile(coordinatorPath, originalCoordinator, 'utf8')
  await writeFile(caseReasonerPath, originalCaseReasoner, 'utf8')
  await writeFile(traceGuardianPath, originalTraceGuardian, 'utf8')
}

function validateCaseId(value) {
  if (typeof value !== 'string' || !/^[a-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('caseId must be a safe AgentSpeak atom, e.g. user_case_001')
  }
  return value
}

async function readInput(value) {
  if (value !== '-') return readFile(path.resolve(value), 'utf8')

  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function normalizeFacts(value, caseId) {
  if (!Array.isArray(value)) throw new Error('facts must be an array of AgentSpeak fact strings')

  const facts = value.map((fact) => normalizeFact(fact)).filter(Boolean)
  if (!facts.includes(`case(${caseId})`)) facts.unshift(`case(${caseId})`)
  return [...new Set(facts)]
}

function normalizeFact(value) {
  if (typeof value !== 'string') throw new Error('Each fact must be a string')
  const fact = value.trim().replace(/\.$/, '')
  if (!fact) return ''
  if (!/^[a-z][A-Za-z0-9_]*(\(.*\))?$/.test(fact)) {
    throw new Error(`Unsupported case fact syntax: ${value}`)
  }
  if (/[{}!;]|<-/.test(fact)) {
    throw new Error(`Case facts cannot contain AgentSpeak directives or plans: ${value}`)
  }
  if (!hasBalancedDelimiters(fact)) {
    throw new Error(`Unbalanced delimiters in fact: ${value}`)
  }
  return fact
}

function setCaseGoal(source, caseId) {
  return source.replace(/!evaluate_and_export\(\w+\)\./, `!evaluate_and_export(${caseId}).`)
}

function addCaseInclude(source, includePath) {
  const includeLine = `{ include("${includePath}") }`
  if (source.includes(includeLine)) return source
  return source.replace(/(\{ include\("cases\/gc_gray_zone\.asl"\) \})/, `$1\n${includeLine}`)
}

async function resolveRuntimeClasspath() {
  const wrapperPath = path.join(repoRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  const command = process.platform === 'win32' ? 'cmd.exe' : wrapperPath
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', wrapperPath, '-q', 'printRuntimeClasspath']
    : ['-q', 'printRuntimeClasspath']
  const { stdout } = await execFileAsync(command, args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 10,
  })
  const classpath = stdout.split(/\r?\n/).filter(Boolean).at(-1)?.trim()
  if (!classpath) throw new Error('Gradle returned an empty runtime classpath')
  return classpath
}

function runJasonMas(runtimeClasspath) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'java',
      [
        `-Djava.util.logging.config.file=${logPropertiesPath}`,
        '-cp',
        runtimeClasspath,
        'jason.infra.local.RunLocalMAS',
        'cardiac_traceability.mas2j',
      ],
      { cwd: repoRoot, timeout: 60000, maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        if (error && error.killed !== true) {
          reject(error)
          return
        }

        resolve({ stdout, stderr, timedOut: error?.killed === true })
      },
    )

    child.on('error', reject)
  })
}

function parseTrace(lines) {
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
  const listKeys = new Set(['activatedRules', 'usedEvidence', 'missingData', 'sources', 'nextSteps', 'humanReview'])

  for (const line of lines) {
    const match = line.match(/(TRACE_[A-Z_]+)=(.*)$/)
    if (!match) continue

    const [, rawKey, rawValue] = match
    const key = keyMap[rawKey]
    if (!key) continue

    trace[key] = listKeys.has(key) ? parseJasonList(rawValue.trim()) : rawValue.trim()
  }

  return trace
}

function parseJasonList(value) {
  if (value === '[]') return []
  if (!value.startsWith('[') || !value.endsWith(']')) return [value]

  const inner = value.slice(1, -1).trim()
  if (!inner) return []

  return splitTopLevel(inner).map((item) => item.trim().replace(/,/g, ', '))
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

function hasBalancedDelimiters(source) {
  let depth = 0
  for (const char of source) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}
