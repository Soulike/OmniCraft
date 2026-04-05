import {ScrollShadow} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseUsage} from '@omnicraft/sse-events';
import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {InfoBar} from './components/InfoBar/index.js';
import {MessageList} from './components/MessageList/index.js';
import {SessionConfigBar} from './components/SessionConfigBar/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  title: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  usage: SseUsage | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  allowedPaths: AllowedPathEntry[];
  pathsLoading: boolean;
  pathsError: string | null;
  workspace: string | undefined;
  extraAllowedPaths: string[];
  resolvedExtraPaths: AllowedPathEntry[];
  onWorkspaceChange: (workspace: string | undefined) => void;
  onExtraAllowedPathsChange: (paths: string[]) => void;
  onSend: (content: string) => void;
  onStop: () => void;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  title,
  messages,
  isStreaming,
  error,
  maxRoundsReached,
  usage,
  scrollRef,
  sessionId,
  allowedPaths,
  pathsLoading,
  pathsError,
  workspace,
  extraAllowedPaths,
  resolvedExtraPaths,
  onWorkspaceChange,
  onExtraAllowedPathsChange,
  onSend,
  onStop,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
  return (
    <div className={styles.page}>
      {error && (
        <ChatAlert
          status='danger'
          title='Error'
          message={error}
          onDismiss={onDismissError}
        />
      )}
      {maxRoundsReached && (
        <ChatAlert
          status='warning'
          title='Tool limit reached'
          message='The assistant reached the maximum number of tool execution rounds. You can increase this limit in Settings > Agent.'
          onDismiss={onDismissMaxRoundsReached}
        />
      )}
      <h2 className={styles.title}>{title ?? 'New Session'}</h2>
      {!sessionId && (
        <SessionConfigBar
          allowedPaths={allowedPaths}
          pathsLoading={pathsLoading}
          pathsError={pathsError}
          workspace={workspace}
          onWorkspaceChange={onWorkspaceChange}
          extraAllowedPaths={extraAllowedPaths}
          onExtraAllowedPathsChange={onExtraAllowedPathsChange}
        />
      )}
      <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
        <MessageList messages={messages} />
      </ScrollShadow>
      <InfoBar
        workspace={workspace}
        extraPaths={resolvedExtraPaths}
        usage={usage}
      />
      <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
    </div>
  );
}
