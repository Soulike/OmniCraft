# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root if it exists. It points to the `CONTEXT.md` files for each domain context; read those relevant to the topic.
- **`docs/adr/`** — read ADRs that affect the area you're about to work in.
- **`<workspace>/docs/adr/`** — also read context-scoped decisions for any relevant workspace.

If these files don't exist, **proceed silently**. Don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

This repo uses a multi-context layout:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                         ← system-wide decisions
├── apps/
│   ├── frontend/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← frontend-specific decisions
│   └── backend/
│       ├── CONTEXT.md
│       └── docs/adr/                 ← backend-specific decisions
└── packages/
    └── <domain-package>/
        ├── CONTEXT.md
        └── docs/adr/                 ← package-specific decisions
```

`CONTEXT-MAP.md` is authoritative about which workspaces are domain contexts. Do not assume every utility or configuration workspace needs its own `CONTEXT.md`.

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept isn't in the glossary, either reconsider whether it belongs to the project's language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
