import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function createRuntimeWorkspace({ repoRoot, workspaceDir, caseId, customFacts = null }) {
  assertOutputWorkspace(repoRoot, workspaceDir)
  await rm(workspaceDir, { recursive: true, force: true })
  await mkdir(workspaceDir, { recursive: true })

  await cp(path.join(repoRoot, 'agents'), path.join(workspaceDir, 'agents'), { recursive: true })
  await cp(path.join(repoRoot, 'beliefs'), path.join(workspaceDir, 'beliefs'), { recursive: true })
  await cp(path.join(repoRoot, 'cases'), path.join(workspaceDir, 'cases'), { recursive: true })

  const workspaceRelative = path.relative(repoRoot, workspaceDir).replace(/\\/g, '/')
  await writeFile(path.join(workspaceDir, 'runtime.mas2j'), renderMasProject(`${workspaceRelative}/agents`), 'utf8')
  await writeFile(
    path.join(workspaceDir, 'agents/runtime_coordinator.asl'),
    setCaseGoal(await readFile(path.join(workspaceDir, 'agents/runtime_coordinator.asl'), 'utf8'), caseId),
    'utf8',
  )

  if (customFacts) {
    await writeFile(path.join(workspaceDir, 'cases', `${caseId}.asl`), renderFacts(customFacts), 'utf8')
    const includePath = `${workspaceRelative}/cases/${caseId}.asl`
    await addCaseInclude(path.join(workspaceDir, 'agents/case_reasoner.asl'), includePath)
    await addCaseInclude(path.join(workspaceDir, 'agents/trace_guardian.asl'), includePath)
  }

  return {
    projectPath: path.join(workspaceDir, 'runtime.mas2j'),
    agentsDir: path.join(workspaceDir, 'agents'),
    casesDir: path.join(workspaceDir, 'cases'),
  }
}

export function parseTrace(lines) {
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

export function parseJasonList(value) {
  if (value === '[]') return []
  if (!value.startsWith('[') || !value.endsWith(']')) return [value]

  const inner = value.slice(1, -1).trim()
  if (!inner) return []

  return splitTopLevel(inner).map((item) => item.trim().replace(/,/g, ', '))
}

export function splitTopLevel(value) {
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

async function addCaseInclude(agentPath, includePath) {
  const source = await readFile(agentPath, 'utf8')
  const includeLine = `{ include("${includePath}") }`
  if (source.includes(includeLine)) return
  await writeFile(agentPath, source.replace(/(\{ include\("cases\/gc_gray_zone\.asl"\) \})/, `$1\n${includeLine}`), 'utf8')
}

function setCaseGoal(source, caseId) {
  return source.replace(/!evaluate_and_export\(\w+\)\./, `!evaluate_and_export(${caseId}).`)
}

function renderFacts(facts) {
  return `${facts.map((fact) => `${fact}.`).join('\n')}\n`
}

function renderMasProject(agentSourcePath) {
  return `MAS cardiac_traceability_runtime {
  infrastructure: Local

  agents:
    runtime_coordinator [verbose=2];
    case_reasoner [verbose=2];
    trace_guardian [verbose=2];
    care_planner [verbose=2];

  aslSourcePath: "${agentSourcePath}";
}
`
}

function assertOutputWorkspace(repoRoot, workspaceDir) {
  const relative = path.relative(repoRoot, workspaceDir)
  if (relative.startsWith('..') || path.isAbsolute(relative) || !relative.replace(/\\/g, '/').startsWith('output/runtime/')) {
    throw new Error(`Refusing to create MAS workspace outside output/runtime: ${workspaceDir}`)
  }
}
