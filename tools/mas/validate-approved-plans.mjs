#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateRuntimePlan } from './plan-validation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_PLANS_DIR = path.join(REPO_ROOT, 'approved/plans')

async function main() {
  const plansDir = parseArgs(process.argv.slice(2)).plansDir ?? DEFAULT_PLANS_DIR
  const files = (await readdir(plansDir)).filter((file) => file.endsWith('.json')).sort()
  const failures = []

  for (const file of files) {
    const filePath = path.join(plansDir, file)
    try {
      const plan = JSON.parse(await readFile(filePath, 'utf8'))
      failures.push(...validateRuntimePlan(plan, path.relative(REPO_ROOT, filePath)))
    } catch (error) {
      failures.push(`${path.relative(REPO_ROOT, filePath)}: ${error.message}`)
    }
  }

  if (files.length === 0) failures.push(`${path.relative(REPO_ROOT, plansDir)}: no JSON plan files found`)

  if (failures.length > 0) {
    console.error('Approved plan validation failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Approved plan validation passed: ${files.length} plan files`)
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--plans-dir') {
      options.plansDir = path.resolve(args[index + 1])
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

main().catch((err) => {
  console.error(`Approved plan validation failed: ${err.message}`)
  process.exit(1)
})
