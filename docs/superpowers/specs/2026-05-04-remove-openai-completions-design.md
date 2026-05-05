# Remove OpenAI Completions Support Design

## Context

OmniCraft currently exposes three LLM API formats: Claude, OpenAI Chat
Completions, and OpenAI Responses. The OpenAI Chat Completions path is no
longer desired and adds maintenance burden. The desired end state is as if the
OpenAI Chat Completions option had never existed.

## Goal

Remove support for `apiFormat: "openai"` completely. Keep only `"claude"` and
`"openai-responses"` as valid LLM API formats.

## Non-Goals

- Do not migrate existing settings that contain `"openai"`.
- Do not keep hidden backend support for `"openai"`.
- Do not rename the existing session completion route names. Those describe
  chat turns in OmniCraft, not the OpenAI Chat Completions API.

## Design

### Settings Schema

`llmSettingsSchema.apiFormat` will accept only `"claude"` and
`"openai-responses"`. Existing settings files containing `"openai"` will fail
schema validation under the existing settings-manager behavior.

### Backend LLM API

The `LlmConfig.apiFormat` type will remove `"openai"`. The LLM API dispatcher
will route only Claude and OpenAI Responses. The OpenAI Chat Completions adapter
module under `apps/backend/src/agent-core/llm-api/openai/` will be deleted.

### Model Capacity

Model capacity dispatch will treat OpenAI-compatible capacity data as belonging
to `"openai-responses"` only. Tests that previously used `"openai"` as a
generic OpenAI fixture will be updated to `"openai-responses"` or Claude based
on the behavior under test.

### Frontend Settings

Both chat and coding LLM settings selectors will remove the `OpenAI
Completions` item. The only visible API format choices will be Claude and OpenAI
Responses.

## Testing

- Add or update settings-schema coverage proving `"openai"` is rejected and
  `"openai-responses"` remains valid.
- Update backend unit tests and fixtures to use supported API formats only.
- Run targeted package tests and type checks for settings schema, backend, and
  frontend.

## Risks

The intentional breaking behavior is that existing settings containing
`"openai"` are no longer valid. This is accepted for this change.
