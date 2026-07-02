import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TraceSchema } from './schemas.js'

const repoRoot = path.resolve(process.cwd(), '../..')

export const runtimeCases = [
  {
    caseId: 'gc04',
    label: 'GC-04: CMR-driven high suspicion',
    expectedTracePath: 'expected/traces/gc04.expected.json',
  },
  {
    caseId: 'gc00',
    label: 'GC-00: no examination available',
    expectedTracePath: 'expected/traces/gc00.expected.json',
  },
  {
    caseId: 'gc_gray_zone',
    label: 'GC-GRAY-ZONE: CT gray zone without PET parameters',
    expectedTracePath: 'expected/traces/gc_gray_zone.expected.json',
  },
  {
    caseId: 'gdpr_lawful_processing',
    label: 'GDPR: lawful processing documented',
    expectedTracePath: 'expected/traces/gdpr_lawful_processing.expected.json',
  },
  {
    caseId: 'gdpr_missing_legal_basis',
    label: 'GDPR: missing legal basis',
    expectedTracePath: 'expected/traces/gdpr_missing_legal_basis.expected.json',
  },
  {
    caseId: 'gdpr_special_category',
    label: 'GDPR: special-category data without exception',
    expectedTracePath: 'expected/traces/gdpr_special_category.expected.json',
  },
  {
    caseId: 'gdpr_breach_overdue',
    label: 'GDPR: breach notification overdue',
    expectedTracePath: 'expected/traces/gdpr_breach_overdue.expected.json',
  },
] as const

const sourceSnippetMap: Record<string, string> = {
  paolisso_2022_dem_score: 'DEM Score cutoff >= 3 supports significant echocardiographic suspicion and second-level imaging consideration.',
  paolisso_2024_cmr_mass_score: 'CMR Mass Score cutoff >= 5 supports malignancy suspicion in cardiac mass evaluation.',
  dangelo_2020_ct_pet: 'Cardiac CT suspicious signs and 18F-FDG PET/CT thresholds support CT/PET pathway interpretation.',
  angeli_2022_multimodality_context: 'Multimodality evaluation supports integrated interpretation, discordance review, and Heart Team discussion.',
  local_safety_behavior: 'Missing data and discordance are surfaced explicitly instead of being treated as negative evidence.',
  gdpr_reg_679_2016_art_6: 'GDPR Article 6 requires at least one lawful basis for personal-data processing.',
  gdpr_reg_679_2016_art_9: 'GDPR Article 9 prohibits special-category data processing unless a listed exception applies.',
  gdpr_reg_679_2016_art_33: 'GDPR Article 33 requires supervisory-authority notification without undue delay and, where feasible, within 72 hours unless risk is unlikely.',
}

export function sourceSnippetsFor(sourceIds: string[]) {
  return sourceIds.map((sourceId) => ({
    sourceId,
    snippet: sourceSnippetMap[sourceId] || 'No curated snippet available for this source.',
  }))
}

export async function loadRuntimeTrace(caseId: string) {
  const runtimeCase = runtimeCases.find((item) => item.caseId === caseId)
  if (!runtimeCase) {
    throw new Error(`Unknown runtime demo case: ${caseId}`)
  }

  const tracePath = path.join(repoRoot, runtimeCase.expectedTracePath)
  const trace = TraceSchema.parse(JSON.parse(await readFile(tracePath, 'utf8')))
  const sourceSnippets = sourceSnippetsFor(trace.sources)

  return {
    mode: 'expected_trace_demo',
    note: 'This demo currently loads expected traces. It is the runtime contract that the Jason exporter must satisfy.',
    case: runtimeCase,
    trace,
    sourceSnippets,
  }
}
