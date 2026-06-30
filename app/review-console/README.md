# Review Console

## Purpose

This directory is reserved for the mandatory minimal web app used to demonstrate the design-time rule authoring and human review pipeline.

Selected stack:

```text
React + Vite + TypeScript + Tailwind CSS
Node.js local backend/proxy
real LLM integration through server-side environment variables
```

The app should remain small, local, and demo-focused. The UI should follow the style of `C:\GitRepos\Tesi`: card-based layout, workflow ribbon, side summary, and explicit traceability/review panels.

## MVP Flow

```text
source text
-> extracted claims
-> candidate rules
-> human review
-> exported approved/rejected rule JSON
```

Runtime demo flow:

```text
golden case
-> structured trace
-> curated source snippets
-> constrained LLM verbalization
```

## Run Locally

```text
npm install
copy .env.example .env
npm run dev
```

The frontend runs through Vite and proxies `/api/*` to the local Node backend.

Required `.env` values:

```text
LLM_PROVIDER=groq
LLM_API_KEY=your-provider-key
LLM_MODEL=qwen/qwen3.6-27b
PORT=8787
```

Use `LLM_PROVIDER=openrouter` to route requests through OpenRouter instead.

## Required Features

- Paste or load source text.
- Display extracted claims.
- Display candidate rules as inspectable JSON.
- Display candidate rules as domain-readable cards plus inspectable technical facts.
- Allow review actions: `approve`, `reject`, `needs_revision`.
- Preserve `sourceId`, source quote, and `ruleId`.
- Export reviewed rule JSON.
- Make clear that draft rules cannot enter runtime.

## LLM Integration

The review console should use a real LLM provider for:

- claim extraction;
- candidate rule drafting.
- trace verbalization from structured trace and curated snippets.

The browser must not call the LLM provider directly. The frontend should call local backend endpoints, and the backend should use server-side environment variables such as:

```text
LLM_PROVIDER=groq
LLM_API_KEY=
LLM_MODEL=
```

Supported providers:

- `groq`: preferred default for the course demo because it is fast and simple for structured extraction;
- `openrouter`: supported fallback for model flexibility.

The app should also support saved/sample outputs for reproducible demos.

## Runtime Demo

The current runtime demo loads expected trace JSON files from `expected/traces/` through backend endpoints:

```text
GET /api/runtime/cases
GET /api/runtime/trace/:caseId
POST /api/verbalize-trace
```

This is the runtime contract that the Jason MAS trace exporter must satisfy once live execution is verified. The verbalizer receives only the structured trace and source snippets; it does not receive the raw source document or unrestricted context.

The UI also loads approved runtime artifacts from:

```text
approved/rules/
```

When a trace is loaded, the console highlights which approved rules match the trace's `activatedRules` field. This shows the runtime link:

```text
approved rule artifact
-> activated rule in trace
-> source snippet
-> constrained explanation
```

## Observability

The backend writes local audit events to:

```text
output/events/audit.jsonl
```

The UI shows recent events in the `Audit trail` card. Events include LLM claim extraction, rule drafting, human review actions, runtime trace loading, approved rule activation, and trace verbalization.

API keys and secrets are never logged.

## Domain Expert View

The UI shows a readable layer before technical facts:

```text
Domain-readable statement
technical AgentSpeak-style fact
```

This is intended to help domain experts review rule meaning without losing auditability.

## Out Of Scope

- Authentication.
- Multi-user database.
- Advanced PDF parsing.
- Open-ended RAG.
- Automatic deployment of generated rules.
- Runtime decision making by the LLM.
