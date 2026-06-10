#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const [, , expectedPath, actualPath] = process.argv

if (!expectedPath || !actualPath) {
  console.error('Usage: node tools/trace/validate-trace.mjs <expected.json> <actual.json>')
  process.exit(1)
}

const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
const actual = JSON.parse(await readFile(actualPath, 'utf8'))
const differences = compare(expected, actual)

if (differences.length > 0) {
  console.error('Trace validation failed:')
  for (const difference of differences) console.error(`- ${difference}`)
  process.exit(1)
}

console.log(`Trace validation passed: ${actualPath}`)

function compare(expectedValue, actualValue, path = '$') {
  const differences = []

  if (Array.isArray(expectedValue)) {
    if (!Array.isArray(actualValue)) return [`${path}: expected array, got ${typeof actualValue}`]
    if (expectedValue.length !== actualValue.length) {
      differences.push(`${path}: expected length ${expectedValue.length}, got ${actualValue.length}`)
    }

    const sortedExpected = [...expectedValue].sort()
    const sortedActual = [...actualValue].sort()
    const length = Math.max(sortedExpected.length, sortedActual.length)
    for (let index = 0; index < length; index += 1) {
      if (sortedExpected[index] !== sortedActual[index]) {
        differences.push(`${path}[${index}]: expected ${JSON.stringify(sortedExpected[index])}, got ${JSON.stringify(sortedActual[index])}`)
      }
    }
    return differences
  }

  if (expectedValue && typeof expectedValue === 'object') {
    for (const key of Object.keys(expectedValue)) {
      differences.push(...compare(expectedValue[key], actualValue?.[key], `${path}.${key}`))
    }
    return differences
  }

  if (expectedValue !== actualValue) {
    differences.push(`${path}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`)
  }

  return differences
}
