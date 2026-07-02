import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { ApprovedPlanSchema } from './schemas.js'

const repoRoot = path.resolve(process.cwd(), '../..')
const approvedPlansDir = path.join(repoRoot, 'approved/plans')

export async function loadApprovedPlans() {
  const files = (await readdir(approvedPlansDir)).filter((file) => file.endsWith('.json')).sort()
  const plans = []

  for (const file of files) {
    const plan = ApprovedPlanSchema.parse(JSON.parse(await readFile(path.join(approvedPlansDir, file), 'utf8')))
    plans.push({ ...plan, artifactPath: `approved/plans/${file}` })
  }

  return plans
}
