# Part 7 — Verification (Task 16)

Back to [index](./README.md). This task ships no new feature code — it proves the whole feature works end-to-end and in both themes. Do not mark the branch done until every box is checked.

---

### Task 16: Full verification

**Files:** none created. Runs the suites and drives the real app.

- [ ] **Step 1: Run every affected test suite**

```bash
pnpm --filter @omnicraft/api-schema test
pnpm --filter @omnicraft/settings-schema test
pnpm --filter @omnicraft/frontend test
```

Expected: all PASS. The frontend run includes every MCP suite: `api/mcp`, `api/settings/mcp`, `helpers/merge-servers`, `helpers/format-transport-summary`, `StatusChip`, `StringListEditor`, `KeyValueEditor`, `useServerForm`, `ServerFormModal`, `ServerCard`, `ServerList`, `useMcpStatus`, `useMcpConfig`, `useServerFormModal`, `McpServersSection`, and `routes`.

- [ ] **Step 2: Typecheck + lint the whole workspace**

```bash
pnpm typecheck:all
pnpm lint:all
pnpm format:check
```

Expected: no type errors, no lint errors, formatting clean. (If `format:check` flags the plan/spec markdown or new files, run `pnpm format` and amend.)

> Do not re-run tests just because the pre-commit hook reformatted files — formatting does not affect test results (repo convention).

- [ ] **Step 3: Start the app**

From the repo root (frees ports automatically and runs frontend + backend):

```bash
pnpm dev
```

Open the printed frontend URL, then navigate to **Settings** (sidebar) → **MCP** → **Servers**.

- [ ] **Step 4: Empty / initial state**

- The **MCP** group appears in the settings nav with a **Servers** child; selecting it shows the "MCP Servers" heading, the description, and an **Add server** button.
- With no servers configured, the empty state reads **"No MCP servers configured yet."**

- [ ] **Step 5: Add a stdio server (happy path)**

- Click **Add server** → the **Add MCP server** modal opens with transport defaulting to **stdio**.
- Name: `filesystem`. Command: `npx`. Add three arguments: `-y`, `@modelcontextprotocol/server-filesystem`, and an absolute path you can read (e.g. your home directory). Submit with **Add**.
- The modal closes, a success toast appears, and a card for `filesystem` appears showing the transport summary and a **not enabled** status chip (both switches off; no Reconnect button).

- [ ] **Step 6: Enable + observe connection**

- Toggle the **Chat** switch on. Within a few seconds (auto-poll), the status chip transitions to **connecting** then **connected**, and a **N tools** disclosure appears.
- Expand the disclosure → the discovered filesystem tools are listed (`read_file`, `write_file`, …).
- A **Reconnect** button is now present. Click it → the chip briefly returns to connecting/connected.

- [ ] **Step 7: Validation + edit**

- Click **Add server** again, enter the name `filesystem` (duplicate) and a command → **Add** is blocked with an inline "already exists" error. Enter an invalid name like `Bad Name` → inline format error. Cancel.
- Click **Edit** on the `filesystem` card → the modal opens pre-filled; the **Name** field is **read-only**. Change an argument and **Save** → success toast; the card's transport summary updates.

- [ ] **Step 8: HTTP + error state**

- Add a **Streamable HTTP** server: switch the transport toggle to **Streamable HTTP** (the stdio fields are replaced by **URL** + **Headers**). Name `broken`, URL `https://127.0.0.1:9/mcp` (an unreachable endpoint). Add, then enable **Coding**.
- The card shows an **error** status chip and the failure reason in a danger `Alert`. **Reconnect** is available.
- Enter an invalid URL (`not-a-url`) in a new/edit form → inline "valid URL" error blocks submit.

- [ ] **Step 9: Disable + remove**

- Toggle both switches off on a server → its chip returns to **not enabled** and the Reconnect button disappears.
- Click **Remove** on a server → it disappears from the list and a success toast shows. Reload the page → it stays gone (persisted), and enablement references were cleared (the removed name is not re-added anywhere).

- [ ] **Step 10: Both themes**

- Toggle the app theme (light ↔ dark). Re-check the page: heading, cards, status chips (success/danger/warning/default), switches, the modal (all fields, transport toggle, row editors), the error alert, and the empty state all read correctly with proper contrast in **both** themes. No bespoke colors that break in one theme.

- [ ] **Step 11: Status-endpoint resilience (optional but recommended)**

- Stop the backend while the page is open (Ctrl-C the `pnpm dev` backend, or block `/api/mcp/servers`). The page must remain usable: config still renders, and the **"Live status is unavailable. Showing your saved configuration."** note appears rather than the page breaking. Restart the backend → status recovers on the next poll.

- [ ] **Step 12: Final commit / branch ready**

- Ensure the working tree is clean (`git status`) and all task commits are present (`git log --oneline`).
- The branch `mcp-settings-page` is ready for a PR against `main`.

```bash
git log --oneline main..HEAD
```

Expected: the schema + per-task frontend commits from Parts 1–6, plus the design spec commit.

---

## Done

All 16 tasks complete → issue #362 (MCP settings UX) is implemented: add/edit/remove servers, per-agent Chat/Coding switches, live status + reconnect, backed by the existing `/settings` endpoints and `GET /api/mcp/servers`, with the dead `'disabled'` status enum trimmed.

Back to [index](./README.md).
