# OmniCraft

> Crafting ideas into reality through autonomous agent collaboration and asynchronous human-in-the-loop review.

**OmniCraft** is a general-purpose, event-driven orchestration engine for building closed-loop agentic workflows. It moves beyond traditional "fire-and-forget" AI generation by treating task execution as an iterative craft. 

Whether it's writing code, generating content, or analyzing data, OmniCraft empowers you to orchestrate distinct agents with pluggable skills, seamlessly connecting internal AI execution with real-world, asynchronous review systems (e.g., GitHub PRs, ADO Work Items, or email threads).

### 🔄 The Core Workflow

OmniCraft operates on a rigorous 4-step execution and refinement loop:

1. **Plan & Dispatch (The Architect):** Start with a chat interface to discuss and finalize requirements. The Orchestrator analyzes your intent and dispatches structured tasks to the right specialized agents.
2. **Execute (The Task Agents):** Task Agents receive the context and utilize specific **Skills** (tools) to execute the work—from cloning repos and writing code to fetching web data.
3. **Internal Validation (The Validator):** Before exposing the output, a Validator Agent performs internal, synchronous checks (e.g., running tests, linting, or format validation) to ensure baseline quality.
4. **External Review & Refine (The Fixer):** The true power of OmniCraft. Once the work is handed off to an external system (like a Pull Request), OmniCraft waits asynchronously. When human reviews or external system comments arrive, a sub-agent (The Fixer) is triggered via webhooks to digest the context and iteratively refine the output.
