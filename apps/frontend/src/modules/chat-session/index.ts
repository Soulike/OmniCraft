// Components
export {ChatAlert} from './components/ChatAlert/index.js';
export {ChatInput} from './components/ChatInput/index.js';
export {InfoBar} from './components/InfoBar/index.js';
export {SessionSetup} from './components/SessionSetup/index.js';
export {SessionSidebar} from './components/SessionSidebar/index.js';
export {StreamingMessageDisplay} from './components/StreamingMessageDisplay/index.js';
export {TitleBarView} from './components/TitleBar/index.js';

// Contexts (providers)
export {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
export {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
export {SessionIdProvider} from './contexts/SessionIdContext/index.js';

// Hooks
export {useChatEventBus} from './hooks/useChatEventBus.js';
export {useMessageCount} from './hooks/useMessageCount.js';
export {useSessionConfig} from './hooks/useSessionConfig.js';
export {useSessionId} from './hooks/useSessionId.js';
export {useSessionTitle} from './hooks/useSessionTitle.js';
export {useStreamChat} from './hooks/useStreamChat.js';
export {useVscodeStatus} from './hooks/useVscodeStatus.js';

// Types
export type {
  ChatEventBus,
  ChatMessage,
} from './components/StreamingMessageDisplay/index.js';

// Styles
export {default as chatSessionStyles} from './styles.module.css';
