import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ApprovedRuleSchema } from './schemas.js'

const repoRoot = path.resolve(process.cwd(), '../..')
const approvedRulesDir = path.join(repoRoot, 'approved/rules')

export async function loadApprovedRules() {
  const files = (await readdir(approvedRulesDir)).filter((file) => file.endsWith('.json')).sort()
  const rules = await Promise.all(
    files.map(async (file) => {
      const raw = JSON.parse(await readFile(path.join(approvedRulesDir, file), 'utf8'))
      return ApprovedRuleSchema.parse({ ...raw, artifactPath: `approved/rules/${file}` })
    }),
  )

  return rules
}
