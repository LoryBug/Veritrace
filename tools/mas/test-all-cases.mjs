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
const outputTracesDir = path.join(repoRoot, 'output/traces')

const cases = [
  { name: 'gc04', expectedFile: 'gc04.expected.json' },
  { name: 'gc00', expectedFile: 'gc00.expected.json' },
  { name: 'gc_gray_zone', expectedFile: 'gc_gray_zone.expected.json' },
  { name: 'gdpr_lawful_processing', expectedFile: 'gdpr_lawful_processing.expected.json' },
  { name: 'gdpr_missing_legal_basis', expectedFile: 'gdpr_missing_legal_basis.expected.json' },
  { name: 'gdpr_special_category', expectedFile: 'gdpr_special_category.expected.json' },
  { name: 'gdpr_breach_overdue', expectedFile: 'gdpr_breach_overdue.expected.json' },
]

const runtimeClasspath = await resolveRuntimeClasspath()
let allPassed = true

await mkdir(outputTracesDir, { recursive: true })

for (const goldenCase of cases) {
  console.log(`=== Testing ${goldenCase.name} ===`)
  const workspaceDir = path.join(repoRoot, 'output/runtime/golden-cases', goldenCase.name, 'workspace')
  const workspace = await createRuntimeWorkspace({ repoRoot, workspaceDir, caseId: goldenCase.name })

  const run = await runJasonMas(workspace.projectPath, repoRoot)
  const trace = parseTrace([...run.stdout.split(/\r?\n/), ...run.stderr.split(/\r?\n/)])
  const expectedPath = path.join(repoRoot, 'expected/traces', goldenCase.expectedFile)
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  const actualPath = path.join(outputTracesDir, `${goldenCase.name}.trace.json`)

  await writeFile(actualPath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8')
  console.log(`  Risk=${trace.risk ?? ''}  Decision=${trace.decision ?? ''}`)
  console.log(`  Trace=${path.relative(repoRoot, actualPath)}`)

  const errors = compare(expected, trace)
  if (run.timedOut) errors.push('Jason MAS timed out')

  if (errors.length === 0) {
    console.log('  PASS')
  } else {
    allPassed = false
    console.log('  FAIL')
    for (const error of errors) console.log(`    ${error}`)
  }
}

if (!allPassed) {
  console.error('\nSOME CASES FAILED')
  process.exit(1)
}

console.log('\nALL CASES PASSED')

async function resolveRuntimeClasspath() {
  const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
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
  if (!classpath) throw new Error(`${wrapper} returned an empty runtime classpath`)
  return classpath
}

function runJasonMas(projectPath, cwd) {
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

function compare(expectedValue, actualValue, tracePath = '$') {
  const differences = []

  if (Array.isArray(expectedValue)) {
    if (!Array.isArray(actualValue)) return [`${tracePath}: expected array, got ${typeof actualValue}`]

    const sortedExpected = [...expectedValue].sort()
    const sortedActual = [...actualValue].sort()
    const length = Math.max(sortedExpected.length, sortedActual.length)
    if (sortedExpected.length !== sortedActual.length) {
      differences.push(`${tracePath}: expected length ${sortedExpected.length}, got ${sortedActual.length}`)
    }

    for (let index = 0; index < length; index += 1) {
      if (sortedExpected[index] !== sortedActual[index]) {
        differences.push(`${tracePath}[${index}]: expected ${JSON.stringify(sortedExpected[index])}, got ${JSON.stringify(sortedActual[index])}`)
      }
    }
    return differences
  }

  if (expectedValue && typeof expectedValue === 'object') {
    for (const key of Object.keys(expectedValue)) {
      differences.push(...compare(expectedValue[key], actualValue?.[key], `${tracePath}.${key}`))
    }
    return differences
  }

  if (expectedValue !== actualValue) {
    differences.push(`${tracePath}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`)
  }

  return differences
}
