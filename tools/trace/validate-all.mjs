#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const expectedDir = path.join(repoRoot, 'expected/traces')
const actualDir = path.join(repoRoot, 'output/traces')
const failures = []

const expectedFiles = (await readdir(expectedDir)).filter((file) => file.endsWith('.expected.json')).sort()

for (const expectedFile of expectedFiles) {
  const caseId = expectedFile.replace(/\.expected\.json$/, '')
  const expectedPath = path.join(expectedDir, expectedFile)
  const actualPath = path.join(actualDir, `${caseId}.trace.json`)

  try {
    await access(actualPath)
  } catch {
    failures.push(`${caseId}: missing actual trace ${path.relative(repoRoot, actualPath)}`)
    continue
  }

  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  const actual = JSON.parse(await readFile(actualPath, 'utf8'))
  const differences = compare(expected, actual)

  if (differences.length === 0) {
    console.log(`Trace validation passed: ${path.relative(repoRoot, actualPath)}`)
  } else {
    failures.push(...differences.map((difference) => `${caseId}: ${difference}`))
  }
}

if (failures.length > 0) {
  console.error('Trace validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`All trace validations passed: ${expectedFiles.length} traces`)

function compare(expectedValue, actualValue, tracePath = '$') {
  const differences = []

  if (Array.isArray(expectedValue)) {
    if (!Array.isArray(actualValue)) return [`${tracePath}: expected array, got ${typeof actualValue}`]
    if (expectedValue.length !== actualValue.length) {
      differences.push(`${tracePath}: expected length ${expectedValue.length}, got ${actualValue.length}`)
    }

    const sortedExpected = [...expectedValue].sort()
    const sortedActual = [...actualValue].sort()
    const length = Math.max(sortedExpected.length, sortedActual.length)
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
