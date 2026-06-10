# MAS Rule Compilation Tools

These tools close the design-time to runtime gap:

```text
approved/rules/*.json
-> standalone JSON/schema validation
-> generated AgentSpeak plans
-> static compilation validation
-> Jason MAS runtime
```

## Validate Approved Rule JSON

```powershell
node tools/mas/validate-approved-rules.mjs
```

This validates every `approved/rules/*.json` artifact before compilation. It checks:

- approved runtime status: `reviewStatus="approved"` and `approvedForRuntime=true`;
- required source metadata and source mapping facts;
- AgentSpeak-compatible conditions, conclusions, and evidence fragments;
- required runtime conclusions: `risk`, `decision`, and `activated_rule`;
- `activated_rule` and `source_for_rule` consistency with the rule id and source id;
- safe `missingDataBehavior` values.

## Compile Approved Rules

```powershell
node tools/mas/compile-rules.mjs
```

This generates:

- `agents/case_reasoner_generated.asl`
- `beliefs/approved_rules.asl`
- `beliefs/approved_rule_sources.asl`

The compiler does not trust draft rules. It reads only artifacts with:

```json
{
  "reviewStatus": "approved",
  "approvedForRuntime": true
}
```

For isolated tests or experiments, the compiler accepts explicit paths:

```powershell
node tools/mas/compile-rules.mjs `
  --rules-dir path/to/rules `
  --generated-agent path/to/case_reasoner_generated.asl `
  --approved-rules-asl path/to/approved_rules.asl `
  --approved-rule-sources-asl path/to/approved_rule_sources.asl
```

## Test Compiler

```powershell
node --test tools/mas/compile-rules.test.mjs
```

The tests compile temporary fixture rules and verify that:

- valid approved runtime rules produce AgentSpeak and belief files;
- draft/non-runtime rules are ignored by the compiler;
- invalid AgentSpeak fragments are rejected;
- mismatched `activated_rule` conclusions are rejected;
- missing source mappings are rejected;
- generation order follows priority before rule id.

## Validate Compilation

```powershell
node tools/mas/validate-compilation.mjs
```

The validator checks that generated AgentSpeak preserves:

- every approved rule id;
- every rule condition;
- `approved_rule(Rule)` gating;
- `risk`, `decision`, and `activated_rule` conclusions;
- used evidence emissions;
- source mappings.

## Generated File Strategy

Generated rules are written to a separate file:

```text
agents/case_reasoner_generated.asl
```

`agents/case_reasoner.asl` includes this file and keeps hand-written reusable predicates and helper plans. This keeps generated code reviewable without overwriting hand-written MAS logic.
