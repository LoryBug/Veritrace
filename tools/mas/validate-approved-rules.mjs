#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateRuntimeRule } from './rule-validation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_RULES_DIR = path.join(REPO_ROOT, 'approved/rules')

async function main() {
  const rulesDir = parseArgs(process.argv.slice(2)).rulesDir ?? DEFAULT_RULES_DIR
  const files = (await readdir(rulesDir)).filter((file) => file.endsWith('.json')).sort()
  const failures = []

  for (const file of files) {
    const filePath = path.join(rulesDir, file)
    try {
      const rule = JSON.parse(await readFile(filePath, 'utf8'))
      failures.push(...validateRuntimeRule(rule, path.relative(REPO_ROOT, filePath)))
    } catch (error) {
      failures.push(`${path.relative(REPO_ROOT, filePath)}: ${error.message}`)
    }
  }

  if (files.length === 0) failures.push(`${path.relative(REPO_ROOT, rulesDir)}: no JSON rule files found`)

  if (failures.length > 0) {
    console.error('Approved rule validation failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Approved rule validation passed: ${files.length} rule files`)
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--rules-dir') {
      options.rulesDir = path.resolve(args[index + 1])
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

main().catch((err) => {
  console.error(`Approved rule validation failed: ${err.message}`)
  process.exit(1)
})
