// Components
export {BottomBar} from './components/BottomBar/index.js';
export {ChatAlert} from './components/ChatAlert/index.js';
export {ChatInput} from './components/ChatInput/index.js';
export {InfoBar} from './components/InfoBar/index.js';
export {SessionSidebar} from './components/SessionSidebar/index.js';
export {TitleBarView} from './components/TitleBar/index.js';

// Contexts (providers + values)
export {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
export {
  type ChatSessionApi,
  ChatSessionApiContext,
} from './contexts/ChatSessionApiContext/index.js';
export {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
export {SessionIdProvider} from './contexts/SessionIdContext/index.js';

// Hooks
export {useAskUserSubmit} from './hooks/useAskUserSubmit.js';
export {useChatEventBus} from './hooks/useChatEventBus.js';
export {useChatSessionApi} from './hooks/useChatSessionApi.js';
export {useMessageCount} from './hooks/useMessageCount.js';
export {useSessionConfig} from './hooks/useSessionConfig.js';
export {useSessionId} from './hooks/useSessionId.js';
export {useSessionTitle} from './hooks/useSessionTitle.js';
export {useStreamChat} from './hooks/useStreamChat.js';
export {useVscodeStatus} from './hooks/useVscodeStatus.js';

// Types
export type {ChatEventBus, ChatMessage} from '@/modules/chat-stream/index.js';

// Styles
export {default as chatSessionStyles} from './styles.module.css';
