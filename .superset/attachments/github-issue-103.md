# GitHub Issue #103: feat(frontend): add subagent support in Chat UI

**URL:** https://github.com/Soulike/OmniCraft/issues/103
**State:** open
**Author:** Soulike
**Created:** 4/11/2026, 4:53:37 PM
**Updated:** 4/11/2026, 4:53:37 PM

---

## Context

Backend subagent dispatch support was added in #101. The backend now streams three new SSE event types for subagent activity:

- `subagent-dispatch` — a subagent was dispatched (`agentId`, `task`)
- `subagent-output` — a forwarded event from the subagent (`agentId`, `event`)
- `subagent-complete` — the subagent finished (`agentId`)

The main agent&#39;s `dispatch_agent` tool has `suppressToolEvents: true`, so no `tool-execute-start/end` events are emitted for it. Only `subagent-*` events appear in the SSE stream.

## Requirements

- Parse and handle the three new SSE event types in the frontend
- Display subagent work progress in real-time within the chat conversation
- Show subagent&#39;s text output, tool usage, and thinking content as they stream
- Visually distinguish subagent activity from the main agent&#39;s output
- Show subagent dispatch info (task description) and completion status

## SSE Event Flow

```
subagent-dispatch   {agentId: &#39;sub-1&#39;, task: &#39;...&#39;}
subagent-output     {agentId: &#39;sub-1&#39;, event: {type: &#39;message-start&#39;, ...}}
subagent-output     {agentId: &#39;sub-1&#39;, event: {type: &#39;text-delta&#39;, content: &#39;...&#39;}}
subagent-output     {agentId: &#39;sub-1&#39;, event: {type: &#39;tool-execute-start&#39;, ...}}
subagent-output     {agentId: &#39;sub-1&#39;, event: {type: &#39;tool-execute-end&#39;, ...}}
subagent-output     {agentId: &#39;sub-1&#39;, event: {type: &#39;done&#39;, ...}}
subagent-complete   {agentId: &#39;sub-1&#39;}
```

## Notes

- Event schemas are defined in `@omnicraft/sse-events`
- Multiple subagents may run in parallel (each identified by `agentId`)
- Subagent&#39;s inner events follow the same schema as main agent events (`text-delta`, `tool-execute-*`, `thinking-*`, etc.)
