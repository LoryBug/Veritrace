import { expect, test } from '@playwright/test'

async function expectRealLlmConfigured(page: import('@playwright/test').Page) {
  await expect(page.locator('.cm-status-panel')).toContainText('groq')
  await expect(page.locator('.cm-status-panel')).toContainText('qwen/qwen3.6-27b')
  await expect(page.locator('.cm-status-panel')).toContainText(
    'configured',
    { timeout: 15_000 },
  )
}

test.beforeEach(async ({ request }) => {
  await request.delete('/api/audit-events')
})

test('shows configured Qwen provider status', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Traceability Agent Framework' })).toBeVisible()
  await expectRealLlmConfigured(page)
})

test('extracts claims and drafts a candidate rule with the real LLM', async ({ page }) => {
  await page.goto('/')
  await expectRealLlmConfigured(page)

  await page.getByRole('button', { name: 'Extract claims with LLM' }).click()
  await expect(page.locator('.claim-card').first()).toBeVisible({ timeout: 90_000 })

  await page.getByRole('button', { name: 'Draft candidate rule' }).click()
  await expect(page.getByLabel('Readable candidate rule fields')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('Draft only')).toBeVisible()

  await page.getByPlaceholder('Review notes').fill('Accepted by Playwright E2E test after real LLM drafting.')
  await page.getByRole('button', { name: 'Approve this rule' }).click()
  await expect(page.locator('.reviewed-rule').first()).toContainText('approved')
  await expect(page.locator('.reviewed-rule').first()).toContainText('Runtime eligible')

  await expect(page.locator('.audit-event-list')).toContainText('llm.claim_extraction.completed')
  await expect(page.locator('.audit-event-list')).toContainText('llm.rule_drafting.completed')
  await expect(page.locator('.audit-event-list')).toContainText('human.rule_approved')
})

test('loads runtime trace and verbalizes it with the real LLM', async ({ page }) => {
  await page.goto('/')
  await expectRealLlmConfigured(page)

  await page.getByLabel('Golden case').selectOption('gc00')
  await page.getByRole('button', { name: 'Load trace' }).click()

  await expect(page.getByRole('heading', { name: 'insufficient_data' })).toBeVisible()
  await expect(page.getByText('Risk:')).toBeVisible()
  await expect(page.getByText('unknown', { exact: true })).toBeVisible()
  await expect(page.locator('code').filter({ hasText: /^critical_data_missing$/ }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Verbalize trace with LLM' }).click()
  await expect(page.getByText('Constrained explanation')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('.verbalization-card')).toContainText('Used sources:')

  await expect(page.locator('.audit-event-list')).toContainText('runtime.trace_loaded')
  await expect(page.locator('.audit-event-list')).toContainText('llm.trace_verbalization.completed')
})

test('evaluates custom AgentSpeak facts with the Jason runtime', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Custom case facts')).toBeVisible()
  await expect(page.getByText('Guided facts from approved predicates')).toBeVisible()

  await page.getByRole('button', { name: 'Evaluate facts with Jason' }).click()

  await expect(page.getByRole('heading', { name: 'cmr_driven_high_suspicion' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('Risk:')).toBeVisible()
  await expect(page.getByText('high', { exact: true })).toBeVisible()
  await expect(page.locator('code').filter({ hasText: /^cmr_mass_score_above_cutoff$/ }).first()).toBeVisible()
  await expect(page.getByText('Trace:')).toBeVisible()

  await expect(page.locator('.audit-event-list')).toContainText('runtime.custom_case_evaluation.completed')
})
