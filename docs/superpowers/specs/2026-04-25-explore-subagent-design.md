# Explore Subagent

## Problem

The main agent currently has a `dispatch_agent` tool, but the only available subagent type is `general`. When the user asks a broad research question, such as understanding project architecture, module design, data flow, call chains, historical context, or change impact, the main agent still tends to read many files itself. That consumes the main conversation context and mixes research work with the final answer or implementation work.

We need a specialized Explore subagent that the main agent can delegate research-heavy questions to. The subagent should read files, inspect repository structure, run observational commands, and return a detailed evidence-based report that the main agent can consume.

## Goals

- Add an `explore` subagent type available through the existing `dispatch_agent` tool.
- Keep Explore focused on research and reporting, not code changes.
- Preserve useful research capabilities, especially Bash for commands like `rg`, `find`, `ls`, `sed`, `git status`, `git diff`, `git show`, `git log`, and `wc`.
- Move main-agent delegation guidance into the subagent tool domain instead of hard-coding it into `CodingAgent` or `MainAgent` base prompts.
- Give Explore a stable default report format so the main agent does not need to specify reporting protocol every time.

## Non-Goals

- Do not create a new top-level API agent type or frontend session mode for Explore.
- Do not implement hard read-only sandboxing in this change.
- Do not remove Bash from Explore.
- Do not let Explore dispatch nested subagents.

## Design Decisions

| Decision           | Choice                                                     | Rationale                                                                                                           |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Agent shape        | New `ExploreSubAgent` class                                | Matches existing `GeneralSubAgent` pattern and keeps behavior isolated.                                             |
| Invocation surface | Existing `dispatch_agent` tool with `agentType: 'explore'` | Avoids new API or UI surface area.                                                                                  |
| Write restriction  | Soft prompt-level read-only behavior                       | The requirement is behavioral, not a security boundary. Bash remains useful for research.                           |
| Dispatch guidance  | `SubAgentToolRegistry.getSystemPromptSection()`            | Keeps subagent usage policy close to the tool and decoupled from individual agent base prompts.                     |
| Report format      | Owned by Explore by default                                | The main agent should provide question, scope, and emphasis, while Explore handles research and reporting protocol. |

## Backend Design

### ExploreSubAgent

Add `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` and export it through the existing agent barrel files.

`ExploreSubAgent` extends `Agent` and uses these registries:

- `CoreToolRegistry`
- `FileToolRegistry`
- `WebToolRegistry`
- `BashToolRegistry`

It intentionally does not include:

- `SubAgentToolRegistry`, so it cannot dispatch more subagents.
- `ClientToolRegistry`, because a delegated research worker should not pause for direct user interaction.
- `TodoToolRegistry`, because Explore's output is a report, not an execution plan that needs visible task state.

The constructor mirrors `GeneralSubAgent`:

```typescript
export class ExploreSubAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>, workingDirectory: string) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
        WebToolRegistry.getInstance(),
        BashToolRegistry.getInstance(),
      ],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: exploreSubAgentSystemPrompt,
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
    });
  }
}
```

### Explore System Prompt

Add `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts`.

The prompt should define Explore as a delegated research agent with these rules:

- Answer the delegated research question by reading project files, docs, tests, configuration, and recent history where relevant.
- Use Bash for observation and discovery only. Good examples include `rg`, `find`, `ls`, `sed`, `git status`, `git diff`, `git show`, `git log`, and `wc`.
- Do not modify, create, delete, format, install, or generate files.
- Do not run commands whose expected purpose is to mutate repository or environment state.
- If a code or documentation change appears necessary, report it as a recommendation instead of making the change.
- Prefer evidence over speculation. Cite concrete files, symbols, and relevant behavior.
- If the delegated task asks for a special output format, follow it. Otherwise use the default report structure.

Default report structure:

1. Direct answer
2. Key evidence
3. Architecture or flow
4. Gaps and uncertainty
5. Suggested next steps

This format belongs to Explore. The main agent may override it by asking for a specific shape, but the default contract should be stable.

### dispatch_agent Agent Types

Update `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`:

- Import `ExploreSubAgent`.
- Add `explore` to `subAgentInfos` with a description focused on codebase and document research.
- Instantiate the correct class based on `agentType`.

Expected selection logic:

```typescript
const subagent: Agent =
  agentType === 'explore'
    ? new ExploreSubAgent(getConfig, workingDirectory)
    : new GeneralSubAgent(getConfig, workingDirectory);
```

The existing SSE metadata already includes `agentType`, `thinkingLevel`, and `workingDirectory`, so the frontend can display `explore` without schema or UI changes.

### SubAgentToolRegistry Prompt Section

Add `getSystemPromptSection()` to `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`.

The section should guide agents that have `dispatch_agent`:

- Use subagents when a subtask can be delegated and does not block the immediate next local action.
- Prefer `explore` for repository research: architecture, module design, cross-file behavior, call chains, data flow, historical context, dependency mapping, and impact analysis.
- Avoid spending main-agent context on broad file-reading research when Explore can produce a report.
- Keep very small local lookups local when dispatch overhead is not worth it.
- When dispatching Explore, provide the question, scope, important constraints, and desired depth. Do not specify a report format unless the user asked for one.
- After Explore returns, the main agent should synthesize the report for the user or use it to guide implementation.

This keeps dispatch policy attached to the subagent tool capability. `CodingAgent` and `MainAgent` remain free of Explore-specific prompt text.

## User Experience

The frontend already renders subagent dispatch panels and displays the agent type from SSE metadata. An Explore run appears as the same subagent disclosure UI with `Type: explore`.

No frontend changes are required for this feature.

## Testing

### Unit Tests

Update `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`:

- Assert the tool accepts `agentType: 'explore'` in its parameter schema.
- Assert the tool description includes both `general` and `explore` in the available agent types.
- Keep existing working directory boundary tests unchanged.

If practical without calling a real LLM, add a narrow construction test that verifies dispatch emits `subagent-dispatch` with `agentType: 'explore'` before execution is aborted. If this is too brittle, rely on schema and typecheck coverage for selection logic.

### Verification Commands

Run the backend checks after implementation:

```bash
bun run --filter '@omnicraft/backend' typecheck
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Run broader backend tests if the implementation touches shared agent construction beyond the files above:

```bash
bun run --filter '@omnicraft/backend' test
```

## Files Changed

| File                                                                   | Change                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts`     | Add Explore behavior and report contract.                   |
| `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` | Add Explore agent class.                                    |
| `apps/backend/src/agent/agents/explore-sub-agent/index.ts`             | Export Explore agent.                                       |
| `apps/backend/src/agent/agents/index.ts`                               | Re-export Explore agent.                                    |
| `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`        | Add `explore` agent type and instantiate `ExploreSubAgent`. |
| `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`    | Add subagent dispatch guidance prompt section.              |
| `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`   | Cover the new agent type and tool description.              |

## Risks

- Prompt-only read-only behavior is not a security boundary. Explore can technically call Bash or file write tools if the model ignores instructions.
- Keeping Bash means accidental mutation is possible if the prompt is not followed. The system prompt should be explicit that Bash is observational only.
- The main agent may still sometimes research locally. The dispatch guidance should frame Explore as preferred for broad research, not mandatory for every lookup.

## Future Enhancements

- Add an optional `readonly` execution mode for subagents if a future requirement needs a stronger safety boundary.
- Add a read-only shell wrapper or denylist if accidental mutation becomes common.
- Track Explore report quality with evaluation prompts once more subagent roles exist.
