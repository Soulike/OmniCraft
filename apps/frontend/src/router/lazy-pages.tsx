import {lazy} from 'react';

export const ChatPage = lazy(async () => {
  const {ChatPage} = await import('@/pages/chat/index.js');
  return {default: ChatPage};
});

export const CodingPage = lazy(async () => {
  const {CodingPage} = await import('@/pages/coding/index.js');
  return {default: CodingPage};
});

export const SettingsPage = lazy(async () => {
  const {SettingsPage} = await import('@/pages/settings/index.js');
  return {default: SettingsPage};
});

export const LlmSection = lazy(async () => {
  const {LlmSection} = await import('@/pages/settings/sections/llm/index.js');
  return {default: LlmSection};
});

export const CodingLlmSection = lazy(async () => {
  const {CodingLlmSection} =
    await import('@/pages/settings/sections/coding-llm/index.js');
  return {default: CodingLlmSection};
});

export const AgentSection = lazy(async () => {
  const {AgentSection} =
    await import('@/pages/settings/sections/agent/index.js');
  return {default: AgentSection};
});

export const SearchSection = lazy(async () => {
  const {SearchSection} =
    await import('@/pages/settings/sections/search/index.js');
  return {default: SearchSection};
});

export const FileAccessSection = lazy(async () => {
  const {FileAccessSection} =
    await import('@/pages/settings/sections/file-access/index.js');
  return {default: FileAccessSection};
});
