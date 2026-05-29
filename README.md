# Veritrace

Traceability-first agentic framework: human-reviewed LLM rule authoring + symbolic BDI reasoning in Jason/AgentSpeak.

> Work in progress — migrated incrementally from `ise-cardiac-traceability-agent`.

## Structure

```
agents/         Jason AgentSpeak agents (MAS runtime)
beliefs/        Symbolic knowledge base
cases/          Golden case data
approved/       Human-approved runtime rules
tools/          Compilation, validation, and trace tooling
app/            Review console (React + Express)
llm-dspy/       Optional DSPy evaluation harness (Python)
docs/           Documentation
expected/       Expected trace contracts
output/         Generated traces and plans (gitignored)
```

## Quick Start

_TBD — coming with Phase 1._
