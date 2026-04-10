# Extract Shared HTTP API Types into `@omnicraft/api-schema`

**Date:** 2026-04-10
**Issue:** #82

## Problem

Frontend and backend define HTTP API request/response types independently:

- Backend: `apps/backend/src/dispatcher/*/validator.ts` (request schemas)
- Frontend: `apps/frontend/src/api/*/validator.ts` (response schemas)

Shared types like `thinkingLevel` are duplicated. No compile-time guarantee that both sides agree on the API contract.

## Solution

Create `@omnicraft/api-schema` — a shared package with Zod schemas for all HTTP API request and response types. Both apps import from this single source of truth.

## Package Structure

```
packages/api-schema/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Re-exports all schemas and types
│   ├── chat/
│   │   └── schema.ts         # Chat endpoint schemas
│   ├── settings/
│   │   └── schema.ts         # Settings endpoint schemas
│   └── file-access/
│       └── schema.ts         # File access endpoint schemas
```

### Dependencies

- `zod`
- `@omnicraft/settings-schema` (for `allowedPathEntrySchema`)

### Package Configuration

Follows existing package patterns:

- `type: "module"`
- Exports `"./src/index.ts"` (direct TypeScript source, no build step)
- Scripts: `typecheck` (`tsc --noEmit`)
- DevDependencies: `@config/eslint`, `@config/typescript`, `typescript`

## Schema Definitions

### `chat/schema.ts`

| Export                         | Type     | Description                                                              |
| ------------------------------ | -------- | ------------------------------------------------------------------------ |
| `thinkingLevelSchema`          | Shared   | `z.enum(['none', 'low', 'medium', 'high'])`                              |
| `ThinkingLevel`                | Type     | Inferred from `thinkingLevelSchema`                                      |
| `createSessionRequestSchema`   | Request  | `{ workspace?: string, extraAllowedPaths?: string[] }` (optional object) |
| `CreateSessionRequest`         | Type     | Inferred                                                                 |
| `createSessionResponseSchema`  | Response | `{ sessionId: string }`                                                  |
| `CreateSessionResponse`        | Type     | Inferred                                                                 |
| `chatCompletionsRequestSchema` | Request  | `{ message: string, thinkingLevel: ThinkingLevel }`                      |
| `ChatCompletionsRequest`       | Type     | Inferred                                                                 |
| `generateTitleRequestSchema`   | Request  | `{ userMessage: string, assistantMessage: string }`                      |
| `GenerateTitleRequest`         | Type     | Inferred                                                                 |
| `generateTitleResponseSchema`  | Response | `{ title: string }`                                                      |
| `GenerateTitleResponse`        | Type     | Inferred                                                                 |

No response schema for `chatCompletions` — it streams SSE events via `@omnicraft/sse-events`.

### `settings/schema.ts`

| Export                           | Type     | Description                                                               |
| -------------------------------- | -------- | ------------------------------------------------------------------------- |
| `settingValueSchema`             | Shared   | `z.unknown().refine(...)` — scalar values only (moved from backend model) |
| `SettingValue`                   | Type     | Inferred                                                                  |
| `getSettingValueResponseSchema`  | Response | `{ value: z.unknown() }`                                                  |
| `GetSettingValueResponse`        | Type     | Inferred                                                                  |
| `putSettingValueRequestSchema`   | Request  | `{ value: settingValueSchema }`                                           |
| `PutSettingValueRequest`         | Type     | Inferred                                                                  |
| `putSettingValueResponseSchema`  | Response | `{ success: boolean }`                                                    |
| `PutSettingValueResponse`        | Type     | Inferred                                                                  |
| `putSettingsBatchRequestSchema`  | Request  | `{ entries: [{ path: string, value: settingValueSchema }] }` (nonempty)   |
| `PutSettingsBatchRequest`        | Type     | Inferred                                                                  |
| `putSettingsBatchResponseSchema` | Response | `{ success: boolean }`                                                    |
| `PutSettingsBatchResponse`       | Type     | Inferred                                                                  |

### `file-access/schema.ts`

| Export                                 | Type     | Description                                                             |
| -------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `getAllowedPathsResponseSchema`        | Response | `{ allowedPaths: allowedPathEntrySchema[] }`                            |
| `GetAllowedPathsResponse`              | Type     | Inferred                                                                |
| `putAllowedPathsRequestSchema`         | Request  | `{ allowedPaths: allowedPathEntrySchema[] }`                            |
| `PutAllowedPathsRequest`               | Type     | Inferred                                                                |
| `putAllowedPathsSuccessResponseSchema` | Response | `{ success: literal(true) }`                                            |
| `PutAllowedPathsSuccessResponse`       | Type     | Inferred                                                                |
| `invalidPathEntrySchema`               | Shared   | `{ path: string, reason: string }`                                      |
| `InvalidPathEntry`                     | Type     | Inferred                                                                |
| `invalidPathsResponseSchema`           | Response | `{ error: literal('INVALID_PATHS'), invalidPaths: InvalidPathEntry[] }` |
| `InvalidPathsResponse`                 | Type     | Inferred                                                                |

## Frontend Cleanup

### `apps/frontend/src/api/chat/validator.ts`

- Remove local `createSessionResponse` and `generateTitleResponse` schemas
- Re-export from `@omnicraft/api-schema`:
  - `createSessionResponseSchema`
  - `generateTitleResponseSchema`
  - `sseEventSchema` (stays, already from `@omnicraft/sse-events`)

### `apps/frontend/src/api/chat/chat.ts`

- Import `ThinkingLevel` type from `@omnicraft/api-schema`
- Replace inline `'none' | 'low' | 'medium' | 'high'` with `ThinkingLevel`

### `apps/frontend/src/api/settings/validator.ts`

- Remove local `getValueResponse`, `putValueResponse`, `putBatchResponse` schemas
- Re-export from `@omnicraft/api-schema`

### `apps/frontend/src/api/settings/file-access/validator.ts`

- Remove local `getAllowedPathsResponse`, `invalidPathEntrySchema`, `invalidPathsResponse`, `putAllowedPathsSuccessResponse`
- Re-export from `@omnicraft/api-schema`

### Frontend validator files

After cleanup, each `validator.ts` becomes a thin re-export layer. This preserves existing import paths in the frontend codebase (e.g., `import {...} from './validator.js'`) while delegating to the shared package. If a validator file would only contain re-exports and nothing else, it can be deleted and its consumers updated to import directly from `@omnicraft/api-schema`.

## Backend Cleanup

### `apps/backend/src/dispatcher/chat/validator.ts`

- Remove local `thinkingLevelSchema`, `createSessionBody`, `chatCompletionsBody`, `generateTitleBody`
- Re-export from `@omnicraft/api-schema`:
  - `createSessionRequestSchema` as `createSessionBody`
  - `chatCompletionsRequestSchema` as `chatCompletionsBody`
  - `generateTitleRequestSchema` as `generateTitleBody`
- Or update router.ts to import directly from `@omnicraft/api-schema`

### `apps/backend/src/dispatcher/settings/validator.ts`

- Remove local `putSettingsBody`, `putSettingsBatchBody`
- Import `settingValueSchema` from `@omnicraft/api-schema` instead of `@/models/settings-manager`
- Keep `parseLeafKeyPath` (it's backend-only logic, not an API schema)

### `apps/backend/src/dispatcher/file-access-settings/validator.ts`

- Remove local `putAllowedPathsBody`
- Import from `@omnicraft/api-schema`

### `apps/backend/src/models/settings-manager/types.ts`

- Remove local `settingValueSchema` and `SettingValue`
- Import from `@omnicraft/api-schema`
- Keep `settingEntrySchema`, `SettingEntry`, `SettingsWarning`, `SettingsManagerCreateResult` (backend-internal)

## Naming Convention

- Schema: `{action}{Resource}{Request|Response}Schema` (camelCase)
- Type: `{Action}{Resource}{Request|Response}` (PascalCase)
- Shared sub-schemas: descriptive name without Request/Response suffix (e.g., `thinkingLevelSchema`, `settingValueSchema`)

## Out of Scope

- SSE event schemas — already in `@omnicraft/sse-events`
- Settings structure schemas — already in `@omnicraft/settings-schema`
- Error response envelope — backend uses ad-hoc `{error: ...}` shapes; standardizing error envelopes is a separate concern
- `GET /settings/json-schema` response — returns a raw JSON Schema object, not a domain type
