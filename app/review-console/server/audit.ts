import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AuditEvent = {
  eventId: string
  timestamp: string
  eventType: string
  actor: 'system' | 'llm' | 'human_reviewer' | 'runtime_demo'
  status: 'started' | 'success' | 'failure'
  details: Record<string, unknown>
}

const repoRoot = path.resolve(process.cwd(), '../..')
const auditDir = path.join(repoRoot, 'output/events')
const auditPath = path.join(auditDir, 'audit.jsonl')

export async function recordAuditEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp'>) {
  await mkdir(auditDir, { recursive: true })
  const fullEvent: AuditEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
    details: sanitizeDetails(event.details),
  }

  await writeFile(auditPath, `${JSON.stringify(fullEvent)}\n`, { flag: 'a', encoding: 'utf8' })
  return fullEvent
}

export async function readAuditEvents(limit = 50) {
  try {
    const content = await readFile(auditPath, 'utf8')
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEvent)
      .slice(-limit)
      .reverse()
  } catch {
    return []
  }
}

export async function clearAuditEvents() {
  await mkdir(auditDir, { recursive: true })
  await writeFile(auditPath, '', 'utf8')
}

function sanitizeDetails(details: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(details)) {
    if (/api.?key|authorization|token|secret|password/i.test(key)) {
      sanitized[key] = '[redacted]'
      continue
    }

    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = `${value.slice(0, 500)}...[truncated:${value.length}]`
      continue
    }

    sanitized[key] = value
  }

  return sanitized
}
