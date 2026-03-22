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
