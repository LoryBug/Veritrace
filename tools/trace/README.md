# Jason Trace Export Tools

## Purpose

These scripts bridge the Jason-side trace exporter and the JSON trace contract.

The AgentSpeak goal emits delimited trace lines:

```text
!evaluate_and_export(gc04).
```

Expected Jason log shape:

```text
TRACE_EXPORT_BEGIN
TRACE_CASE=gc04
TRACE_RISK=high
TRACE_DECISION=cmr_driven_high_suspicion
TRACE_ACTIVATED_RULES=[cmr_mass_score_above_cutoff]
TRACE_USED_EVIDENCE=[score(gc04,cmr_mass_score,5)]
TRACE_MISSING_DATA=[echo,ct_pet,pet]
TRACE_SOURCES=[paolisso_2024_cmr_mass_score]
TRACE_NEXT_STEPS=[heart_team_discussion,staging_or_histological_assessment]
TRACE_HUMAN_REVIEW=[]
TRACE_EXPORT_END
```

The parser converts this log format into the structured JSON trace contract.

## Parse A Jason Trace Log

```powershell
node tools/trace/parse-jason-trace.mjs tools/trace/fixtures/gc04.jason-trace.log output/traces/gc04.trace.json
```

## Validate Against Expected Trace

```powershell
node tools/trace/validate-trace.mjs expected/traces/gc04.expected.json output/traces/gc04.trace.json
```

## Validate All Generated Traces

After running the live MAS test, validate all generated case traces:

```powershell
npm run test:mas
npm run validate:traces
```

## Current Limitation

The repository includes the CLI-first MAS scaffold in `cardiac_traceability.mas2j` and the coordinator exporter in `agents/runtime_coordinator.asl`. Local live execution still depends on having Jason installed and available in PATH. The parser and validator are already executable through Node.
