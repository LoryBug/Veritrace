# Review Console UI Direction

## Reference Project

The review console should be visually and structurally inspired by:

```text
C:\GitRepos\Tesi\packages\frontend
```

The goal is not to copy the thesis PWA feature-by-feature. The goal is to reuse the same interaction language because the cardiac case study originates from that project.

## Stack

```text
React + Vite + TypeScript + Tailwind CSS
Node.js local backend/proxy
```

## Visual Language

Reuse the same broad design principles:

- glass-like cards over a soft clinical background;
- dark blue header/hero surfaces;
- teal accent for traceability and active steps;
- card-based workflow sections;
- right sidebar for status, review actions, and export;
- collapsible traceability/review panels;
- compact pills for rule states such as `draft`, `approved`, `rejected`, `needs_revision`.

## Proposed Screen Structure

```text
Header
  Traceability Agent Framework
  Rule Authoring
  Approved Rules
  Demo Trace

Hero / Status
  Current source
  Provider/model
  Number of claims
  Number of candidate rules

Main Layout
  Left column:
    1. Source input card
    2. Extracted claims card
    3. Candidate rule JSON card
    4. Traceability preview card

  Right sidebar:
    Provider status
    Review actions
    Export buttons
    Safety note
```

## Workflow Ribbon

The interface should expose the lifecycle as a visible workflow ribbon:

```text
1 Source
2 Claims
3 Candidate Rules
4 Human Review
5 Export
```

This mirrors the thesis PWA workflow style while adapting it to rule authoring.

## Review Actions

Each candidate rule must support:

- `approve`;
- `reject`;
- `needs_revision`;
- free-text review notes.

Only `approved` rules should set:

```json
{
  "approvedForRuntime": true
}
```

## LLM Provider Panel

The UI should display provider configuration without exposing secrets:

```text
Provider: groq | openrouter
Model: configured model name
API key: server-side only
```

The frontend should call local endpoints only:

```text
POST /api/extract-claims
POST /api/draft-rule
```

## Demo Constraints

The demo should include:

- one real LLM extraction from the CMR Mass Score snippet;
- one exported candidate rule;
- one approved rule after human review;
- one saved sample response for reproducibility;
- clear warning that generated draft rules are not runtime rules.
