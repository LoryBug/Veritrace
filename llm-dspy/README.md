# DSPy Harness

## Purpose

This optional module makes the LLM authoring layer measurable and extensible.

It does not replace the Node backend used by the review console. Instead, it evaluates and can later optimize the design-time LLM tasks:

```text
source document -> extracted claims
claim -> candidate rule
```

## Why DSPy Here

DSPy is useful because it moves the LLM layer from hand-written prompts only to:

```text
signatures + examples + metrics + optimization
```

For this project, the important metrics are not generic fluency. They are traceability constraints:

- output is valid JSON;
- claims include source quotes;
- generated rules stay `draft`;
- generated rules set `approvedForRuntime = false`;
- missing data are not treated as negative evidence;
- rule outputs do not invent sources.

## Setup

```powershell
cd C:\GitRepos\ise-cardiac-traceability-agent\llm-dspy
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

Create `.env`:

```text
DSPY_MODEL=groq/qwen/qwen3.6-27b
GROQ_API_KEY=your-key
```

For OpenRouter, use a LiteLLM-compatible model name and key:

```text
DSPY_MODEL=openrouter/openai/gpt-4o-mini
OPENROUTER_API_KEY=your-key
```

## Run Evaluation

```powershell
trace-dspy-eval
```

Or directly:

```powershell
python -m traceability_dspy.evaluate
```

By default the evaluator writes a local report to:

```text
output/dspy/evaluation-report.json
```

Useful task-specific runs:

```powershell
python -m traceability_dspy.evaluate --task extract_claims
python -m traceability_dspy.evaluate --task draft_rule
```

Live evaluation uses four checked-in examples per task as DSPy demos by default. You can change this with:

```powershell
python -m traceability_dspy.evaluate --mode live --demo-count 2
```

Groq/OpenRouter transient rate limits are retried automatically. Tune this with:

```powershell
python -m traceability_dspy.evaluate --mode live --retries 3 --retry-seconds 20
```

Dataset/metric sanity check without LLM calls:

```powershell
python -m traceability_dspy.evaluate --mode fixtures
```

The harness loads environment variables from `llm-dspy/.env` first and then from the review console `.env`, so the same local Groq/OpenRouter key can be reused without exposing it to the browser.

## Current Scope

This is a lightweight evaluation harness with multi-domain examples. It is intentionally separate from the runtime pipeline:

```text
DSPy: improve and evaluate LLM authoring behavior
Review console: real user workflow and human review
Jason: symbolic runtime reasoning
```

Future work can add DSPy optimizers once there are more examples.
