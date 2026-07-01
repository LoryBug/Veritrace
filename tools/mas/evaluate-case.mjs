#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createRuntimeWorkspace, parseTrace } from './runtime-workspace.mjs'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
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
const workspaceDir = path.join(runtimeDir, 'workspace')
const tracePath = path.join(runtimeDir, 'trace.json')

await mkdir(runtimeDir, { recursive: true })
const workspace = await createRuntimeWorkspace({ repoRoot, workspaceDir, caseId, customFacts: facts })
const runtimeClasspath = await resolveRuntimeClasspath()
const run = await runJasonMas(runtimeClasspath, workspace.projectPath, repoRoot)
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
  workspaceDir: path.relative(repoRoot, workspaceDir).replace(/\\/g, '/'),
}, null, 2)}\n`)

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

function runJasonMas(runtimeClasspath, projectPath, cwd) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'java',
      [
        `-Djava.util.logging.config.file=${logPropertiesPath}`,
        '-cp',
        runtimeClasspath,
        'jason.infra.local.RunLocalMAS',
        projectPath,
      ],
      { cwd, timeout: 60000, maxBuffer: 1024 * 1024 * 10 },
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

function hasBalancedDelimiters(source) {
  let depth = 0
  for (const char of source) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}
