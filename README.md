# Veritrace

Traceability-first agentic framework: human-reviewed LLM rule authoring + symbolic BDI reasoning in Jason/AgentSpeak.

```text
source document
 -> LLM-assisted claim extraction
 -> candidate rule drafting
 -> human review
 -> promote approved rules to runtime
 -> AgentSpeak compilation and validation
 -> custom case facts
 -> Jason MAS runtime reasoning in an isolated workspace
 -> structured trace
 -> constrained explanation
```

## Project Structure

```
agents/                      Jason AgentSpeak agents (MAS runtime)
  runtime_coordinator.asl     Orchestrates case evaluation + trace export
  case_reasoner.asl           Approved domain-rule execution
  trace_guardian.asl          Meta-rules / safety checks
  care_planner.asl            BDI next-step planning
  cardiac_mass_agent.asl      Mono-agent reference artifact
  case_reasoner_generated.asl Auto-generated from approved rules
beliefs/                     Symbolic knowledge base
  approved_rules.asl          Gating beliefs for approved rules
  approved_rule_sources.asl   Rule-to-source mappings
  cutoffs.asl                 Domain cutoffs
  sources.asl                 Source metadata
  source_snippets.asl         Curated source text
  clinical_actions.asl        Next-step action definitions
cases/                       Golden case facts
  gc00.asl                    Insufficient data (safety)
  gc04.asl                    CMR-driven high suspicion
  gc_gray_zone.asl            CT gray zone / missing PET
approved/rules/              Human-approved runtime rule artifacts
  cmr_mass_score_above_cutoff.json
  critical_data_missing.json
  ct_gray_zone_without_pet.json
approved/plans/              Human-approved runtime plan artifacts
  gdpr_breach_notification_plan.json
expected/traces/             JSON trace contracts for golden cases
tools/
  mas/                        Compiler, validator, MAS runners, tests
  trace/                      Jason trace parser + validator
app/review-console/          React + Express design-time authoring app
llm-dspy/                    Optional DSPy evaluation harness (Python)
output/                      Generated traces and plans (gitignored)
```

## Prerequisites

- **Node.js >= 22** (for all JS tooling)
- **Java >= 21** (for the Jason MAS runtime; Java 23 is known to work locally)

Jason itself is resolved through the checked-in Gradle wrapper as `io.github.jason-lang:jason-interpreter:3.3.0`; no standalone Jason installation is required.

## Quick Start

```powershell
# Install JS dependencies
cd app/review-console
npm install

# Run all validation tests (unit + compile + trace fixture)
cd ../..
npm test

# Compile approved rules and plans to AgentSpeak
npm run compile

# Validate generated AgentSpeak
npm run validate:compilation

# Run the live Jason MAS over all golden cases
npm run test:mas

# Run non-LLM Playwright smoke tests
npm run test:e2e:smoke
```

## Test Commands

| Command | What it does |
|---|---|
| `npm test` | All unit tests and artifact validation |
| `npm run validate:rules` | Validate approved rule JSON artifacts |
| `npm run validate:plans` | Validate approved plan JSON artifacts |
| `npm run validate:compilation` | Validate generated AgentSpeak |
| `npm run validate:traces` | Validate all generated traces in `output/traces/` |
| `npm run compile` | Compile approved rules and plans to AgentSpeak |
| `npm run lint:ast-grep` | Custom ast-grep linting rules |
| `npm run test:mas` | Live Jason MAS E2E for cardiac and GDPR golden cases |
| `npm run test:e2e:smoke` | Non-LLM Playwright smoke tests: promote-rule API, custom facts, Jason runtime |
| `npm run test:e2e` | Full Playwright review-console E2E, including real LLM calls when configured |

## Review Console

The web app for claim extraction, candidate rule drafting, human review, runtime promotion, custom case evaluation, and trace verbalization:

```powershell
cd app/review-console
npm install
copy .env.example .env   # then edit LLM_API_KEY
npm run dev
```

Open `http://127.0.0.1:5173`. The backend runs on port `8787`.

Main review-console flows:

- paste a paper/policy/guideline snippet and extract claims with the configured LLM;
- draft a candidate symbolic rule from a selected claim;
- review predicate mappings and raw AgentSpeak-compatible fragments;
- approve, reject, or mark the candidate rule as needing revision;
- promote an approved reviewed rule into `approved/rules/`;
- compile and validate approved runtime rules and plans;
- enter custom case facts through the generic fact editor or guided predicate builder;
- run Jason live and inspect the structured trace;
- verbalize a trace with a constrained LLM prompt.

If a promoted runtime artifact already exists, the UI asks before overwriting it. Promotion writes the approved JSON artifact, recompiles AgentSpeak, validates the generated runtime files, and rolls back the artifact if compilation fails.

## Approved Plan Pipeline

Rules decide what symbolic conclusion applies. Plans decide what next steps the MAS should emit after that conclusion.

The current framework keeps both layers human-reviewed:

- candidate rules become `approved/rules/*.json` only after review;
- approved rules compile into `agents/case_reasoner_generated.asl` and rule metadata beliefs;
- approved plans live in `approved/plans/*.json`;
- approved plans compile into `agents/care_planner_generated.asl` and `beliefs/approved_plans.asl`;
- Jason executes only generated rule and plan artifacts gated by `approved_rule(...)` and `approved_plan(...)` facts.

This keeps the LLM role controlled: it may draft candidate rules or candidate plans, but runtime behavior must come from approved symbolic artifacts.

## Trace Pipeline

The live MAS runners use the Gradle wrapper and Jason interpreter dependency. Runtime executions are isolated: each run creates a temporary MAS workspace under `output/runtime/.../workspace`, copies the runtime sources there, applies the selected case goal, and runs Jason from that workspace. Source files under `agents/`, `beliefs/`, and `cases/` are not patched during runtime tests.

Golden case validation:

```powershell
npm run test:mas
npm run validate:traces
```

Custom fact evaluation from the CLI:

```powershell
'{"caseId":"user_case_001","facts":["case(user_case_001)","available(user_case_001, cmr)","score(user_case_001, cmr_mass_score, 5)"]}' | node tools/mas/evaluate-case.mjs -
```

The output contains `mode: "jason_live_case"`, the normalized input facts, the structured trace, and the generated workspace/trace paths under `output/runtime/`.

For lower-level trace tooling, parse and validate a Jason log manually:

```powershell
# Parse a Jason trace log to JSON
node tools/trace/parse-jason-trace.mjs <log.txt> output/traces/<case>.trace.json

# Validate against expected trace
node tools/trace/validate-trace.mjs expected/traces/<case>.expected.json output/traces/<case>.trace.json
```

## Docker / Compose

Docker is optional but useful for portability. The image contains Node 22, Java 21, the Gradle wrapper, and the review-console dependencies.

```powershell
# Fast validation suite
docker compose run --rm tests

# Live Jason MAS over all golden cases
docker compose run --rm mas

# Review console at http://localhost:5173
docker compose up review-console
```

For LLM-backed review-console calls, provide provider settings through your shell or a root `.env` file consumed by Compose:

```text
LLM_PROVIDER=groq
LLM_API_KEY=your-provider-key
LLM_MODEL=qwen/qwen3.6-27b
```

The full Playwright E2E suite requires a real provider key. It accepts `LLM_API_KEY`, or provider-specific aliases such as `GROQ_API_KEY` and `OPENROUTER_API_KEY`. The smoke suite `npm run test:e2e:smoke` does not call the LLM and is suitable for CI.

## DSPy Harness

```powershell
cd llm-dspy
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
trace-dspy-eval
```

## CI Pipeline

GitHub Actions runs on every push and pull request:

- install review-console dependencies with `npm ci`;
- run the root validation suite with `npm test`;
- typecheck and build the review console;
- run live Jason MAS golden cases with `npm run test:mas`;
- install Playwright Chromium;
- run non-LLM Playwright smoke tests with `npm run test:e2e:smoke`.

LLM-backed Playwright tests are intentionally not required in CI unless a separate secret-gated job is added.

## Case Studies

The cardiac mass domain demonstrates the framework with three golden cases:

- **GC-00** — no examination available → `risk: unknown`, safety behavior
- **GC-04** — CMR score ≥ 5 → `risk: high`, source-grounded rule activation
- **GC-GRAY-ZONE** — CT gray zone without PET → `risk: mid`, intermediate uncertainty

The GDPR compliance benchmark demonstrates cross-domain generalization with verified `Reg. 679/2016` sources:

- **GDPR lawful processing** — documented legal basis and transparency facts → `risk: low`
- **GDPR missing legal basis** — personal-data processing without encoded lawful basis → `risk: high`
- **GDPR special category** — special-category data without encoded Article 9 exception → `risk: high`
- **GDPR breach overdue** — likely-risk breach known for more than 72 hours without authority notification → `risk: high`

## Academic Positioning

- Primary reference: **Logic-LM** (Pan et al., EMNLP 2023) — LLM-to-symbolic-solver separation
- Runtime: **Jason/AgentSpeak** BDI multi-agent system
- LLM role: controlled — draft authoring at design time, trace verbalization at runtime
- Human role: mandatory approval gate between candidate and runtime rules
- Planning extension: GDPR next-step plans are compiled from approved plan artifacts, motivated by the professor-recommended planning paper; deeper LLM-assisted plan synthesis remains future work rather than an autonomous runtime planner.

> This is not an LLM making decisions. This is a symbolic MAS executing human-approved rules, with LLM assistance only for drafting and verbalization.

## License

MIT
