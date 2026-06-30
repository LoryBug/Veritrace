# Veritrace

Traceability-first agentic framework: human-reviewed LLM rule authoring + symbolic BDI reasoning in Jason/AgentSpeak.

```text
source document
 -> LLM-assisted claim extraction
 -> candidate rule drafting
 -> human review
 -> approved symbolic rules
 -> Jason MAS runtime reasoning
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
expected/traces/             JSON trace contracts for golden cases
tools/
  mas/                        Compiler, validator, tests
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

# Compile approved rules to AgentSpeak
npm run compile

# Validate generated AgentSpeak
npm run validate:compilation

# Run the live Jason MAS over all golden cases
npm run test:mas
```

## Test Commands

| Command | What it does |
|---|---|
| `npm test` | All unit tests (rule validation + compiler) |
| `npm run validate:rules` | Validate approved rule JSON artifacts |
| `npm run validate:compilation` | Validate generated AgentSpeak |
| `npm run validate:traces` | Validate all generated traces in `output/traces/` |
| `npm run compile` | Compile approved rules to AgentSpeak |
| `npm run lint:ast-grep` | Custom ast-grep linting rules |
| `npm run test:mas` | Live Jason MAS E2E for `gc04`, `gc00`, `gc_gray_zone` |

## Review Console

The web app for claim extraction, candidate rule drafting, and human review:

```powershell
cd app/review-console
npm install
copy .env.example .env   # then edit LLM_API_KEY
npm run dev
```

Open `http://127.0.0.1:5173`. The backend runs on port `8787`.

## Trace Pipeline

The live MAS test runs through the Gradle wrapper:

```powershell
npm run test:mas
npm run validate:traces
```

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

## DSPy Harness

```powershell
cd llm-dspy
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
trace-dspy-eval
```

## CI Pipeline

GitHub Actions runs on every push: typecheck + build review console, lint, validate rules, compile, validate compilation, validate trace fixture, check DSPy syntax.

## Case Study

The cardiac mass domain demonstrates the framework with three golden cases:

- **GC-00** — no examination available → `risk: unknown`, safety behavior
- **GC-04** — CMR score ≥ 5 → `risk: high`, source-grounded rule activation
- **GC-GRAY-ZONE** — CT gray zone without PET → `risk: mid`, intermediate uncertainty

## Academic Positioning

- Primary reference: **Logic-LM** (Pan et al., EMNLP 2023) — LLM-to-symbolic-solver separation
- Runtime: **Jason/AgentSpeak** BDI multi-agent system
- LLM role: controlled — draft authoring at design time, trace verbalization at runtime
- Human role: mandatory approval gate between candidate and runtime rules

> This is not an LLM making decisions. This is a symbolic MAS executing human-approved rules, with LLM assistance only for drafting and verbalization.

## License

MIT
