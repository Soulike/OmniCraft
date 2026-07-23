import {lazy} from 'react';

export const ChatPage = lazy(async () => {
  const {ChatPage} = await import('@/pages/chat/index.js');
  return {default: ChatPage};
});

export const CodingPage = lazy(async () => {
  const {CodingPage} = await import('@/pages/coding/index.js');
  return {default: CodingPage};
});

export const ShowcasePage = lazy(async () => {
  const {ShowcasePage} =
    await import('@/modules/chat-stream/showcase/index.js');
  return {default: ShowcasePage};
});

export const SettingsPage = lazy(async () => {
  const {SettingsPage} = await import('@/pages/settings/index.js');
  return {default: SettingsPage};
});

export const ChatLlmSection = lazy(async () => {
  const {ChatLlmSection} =
    await import('@/pages/settings/sections/llm/chat/index.js');
  return {default: ChatLlmSection};
});

export const CodingLlmSection = lazy(async () => {
  const {CodingLlmSection} =
    await import('@/pages/settings/sections/coding/agent/index.js');
  return {default: CodingLlmSection};
});

export const AgentRuntimeSection = lazy(async () => {
  const {AgentRuntimeSection} =
    await import('@/pages/settings/sections/agent/runtime/index.js');
  return {default: AgentRuntimeSection};
});

export const SearchSection = lazy(async () => {
  const {SearchSection} =
    await import('@/pages/settings/sections/tools/search/index.js');
  return {default: SearchSection};
});

export const WorkspacesSection = lazy(async () => {
  const {WorkspacesSection} =
    await import('@/pages/settings/sections/coding/workspaces/index.js');
  return {default: WorkspacesSection};
});

export const McpServersSection = lazy(async () => {
  const {McpServersSection} =
    await import('@/pages/settings/sections/mcp/servers/index.js');
  return {default: McpServersSection};
});
