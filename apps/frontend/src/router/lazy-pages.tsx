import {lazy} from 'react';

export const ChatPage = lazy(async () => {
  const {ChatPage} = await import('@/pages/chat/index.js');
  return {default: ChatPage};
});

export const SettingsPage = lazy(async () => {
  const {SettingsPage} = await import('@/pages/settings/index.js');
  return {default: SettingsPage};
});

export const LlmSection = lazy(async () => {
  const {LlmSection} = await import('@/pages/settings/sections/llm/index.js');
  return {default: LlmSection};
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
