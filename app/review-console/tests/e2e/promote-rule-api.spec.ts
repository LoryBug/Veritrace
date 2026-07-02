import { expect, test } from '@playwright/test'
import { execFile } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(process.cwd(), '../..')
const promotedRuleId = 'playwright_runtime_promotion_smoke'
const invalidRuleId = 'playwright_runtime_promotion_invalid'
const promotedArtifact = path.join(repoRoot, 'approved/rules', `${promotedRuleId}.json`)
const invalidArtifact = path.join(repoRoot, 'approved/rules', `${invalidRuleId}.json`)

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  await request.delete('/api/audit-events')
  await cleanupRuntimeArtifacts()
})

test.afterEach(async () => {
  await cleanupRuntimeArtifacts()
})

test('promotes an approved reviewed rule through the API', async ({ request }) => {
  const response = await request.post('/api/runtime/promote-rule', {
    data: {
      overwrite: false,
      rule: reviewedRule(promotedRuleId),
    },
  })

  expect(response.ok(), await response.text()).toBeTruthy()
  const body = await response.json()
  expect(body.artifactPath).toBe(`approved/rules/${promotedRuleId}.json`)
  expect(body.compilation.generatedFiles).toContain('agents/case_reasoner_generated.asl')
  await expectFile(promotedArtifact)
})

test('rejects promotion when the runtime artifact already exists', async ({ request }) => {
  const response = await request.post('/api/runtime/promote-rule', {
    data: {
      overwrite: false,
      rule: reviewedRule('cmr_mass_score_above_cutoff'),
    },
  })

  expect(response.status()).toBe(409)
  expect(await response.text()).toContain('already exists')
})

test('rolls back a promoted artifact when compilation validation fails', async ({ request }) => {
  const response = await request.post('/api/runtime/promote-rule', {
    data: {
      overwrite: false,
      rule: {
        ...reviewedRule(invalidRuleId),
        conclusions: [
          'decision(Case, invalid_smoke_decision)',
          `activated_rule(Case, ${invalidRuleId})`,
        ],
      },
    },
  })

  expect(response.status()).toBe(400)
  expect(await response.text()).toContain('conclusions must include risk')
  await expectMissingFile(invalidArtifact)
})

function reviewedRule(ruleId: string) {
  return {
    ruleId,
    domain: 'cardiac_mass',
    title: `Playwright runtime smoke ${ruleId}`,
    ruleType: 'threshold',
    reviewStatus: 'approved',
    approvedForRuntime: true,
    source: {
      sourceId: 'paolisso_2024_cmr_mass_score',
      quote: 'CMR Mass Score cutoff >= 5 supports malignancy suspicion in cardiac mass evaluation.',
    },
    conditions: [
      'score(Case, cmr_mass_score, Score)',
      'cutoff(cmr_mass_score, Cutoff)',
      'Score >= Cutoff',
    ],
    conclusions: [
      'risk(Case, high)',
      'decision(Case, playwright_smoke_high_suspicion)',
      `activated_rule(Case, ${ruleId})`,
    ],
    missingDataBehavior: 'do_not_assume_negative',
    humanReview: {
      required: true,
      reviewNotes: [],
    },
    reviewedAt: new Date().toISOString(),
    reviewNotes: ['Promoted by Playwright API smoke test.'],
  }
}

async function cleanupRuntimeArtifacts() {
  await rm(promotedArtifact, { force: true })
  await rm(invalidArtifact, { force: true })
  await execFileAsync(process.execPath, [path.join(repoRoot, 'tools/mas/compile-rules.mjs')], { cwd: repoRoot })
}

async function expectFile(filePath: string) {
  const result = await stat(filePath)
  expect(result.isFile()).toBeTruthy()
}

async function expectMissingFile(filePath: string) {
  await expect(stat(filePath)).rejects.toThrow()
}
