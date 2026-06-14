import {TOOL_NAME} from '@omnicraft/tool-schemas';
import clsx from 'clsx';
import {use} from 'react';

import {SessionIdContext} from '../../../../contexts/SessionIdContext/index.js';
import {formatTimestamp} from '../../helpers/formatTimestamp.js';
import type {MessageRenderItem} from '../../hooks/useMessageList.js';
import {AskUserCard} from '../AskUserCard/index.js';
import {ContextCompactionBlock} from '../ContextCompactionBlock/index.js';
import {MessageBubble} from '../MessageBubble/index.js';
import {SubagentDisclosure} from '../SubagentDisclosure/index.js';
import {ThinkingBlock} from '../ThinkingBlock/index.js';
import {ToolExecutionCard} from '../ToolExecutionCard/index.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

interface RenderItemProps {
  item: MessageRenderItem;
}

export function RenderItem({item}: RenderItemProps) {
  switch (item.type) {
    case 'user-text':
      return (
        <div className={styles.userMessage}>
          <MessageBubble role='user' id={item.id} content={item.content} />
          {item.createdAt !== null && (
            <time className={styles.timestamp}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
    case 'assistant-text':
      return (
        <div className={styles.assistantMessage}>
          <MessageBubble role='assistant' id={item.id} content={item.content} />
          {item.createdAt !== null && (
            <time className={clsx(styles.timestamp, styles.timestampRight)}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
    case 'tool-execution': {
      if (item.toolName === TOOL_NAME.ASK_USER) {
        const sessionId = use(SessionIdContext);
        // sessionId can be null during session transitions (old messages
        // not yet cleared). Skip rendering; messages will be cleared next frame.
        if (sessionId === null) {
          return null;
        }
        if (item.status === 'running') {
          return (
            <div className={styles.assistantMessage}>
              <AskUserCard
                sessionId={sessionId}
                callId={item.callId}
                arguments={item.arguments}
                status='running'
              />
            </div>
          );
        }
        if (item.status === 'done') {
          return (
            <div className={styles.assistantMessage}>
              <AskUserCard
                sessionId={sessionId}
                callId={item.callId}
                arguments={item.arguments}
                status='done'
                data={item.data}
              />
            </div>
          );
        }
        return (
          <div className={styles.assistantMessage}>
            <AskUserCard
              sessionId={sessionId}
              callId={item.callId}
              arguments={item.arguments}
              status={item.status}
              data={item.data}
            />
          </div>
        );
      }
      return (
        <div className={styles.assistantMessage}>
          <ToolExecutionCard
            callId={item.callId}
            toolName={item.toolName}
            displayName={item.displayName}
            arguments={item.arguments}
            status={item.status}
            result={'result' in item ? item.result : undefined}
            data={'data' in item ? item.data : undefined}
          />
        </div>
      );
    }
    case 'thinking':
      if (item.content.trim() === '') {
        // thinking-start arrived but no delta yet — keep the working
        // indicator visible instead of rendering an empty block.
        return (
          <div className={styles.assistantMessage}>
            <WorkingIndicator />
          </div>
        );
      }
      return (
        <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
          <ThinkingBlock content={item.content} done={item.done} />
        </div>
      );
    case 'subagent':
      return (
        <div className={styles.assistantMessage}>
          <SubagentDisclosure
            mode={item.mode}
            agentId={item.agentId}
            task={item.task}
            agentType={item.agentType}
            thinkingLevel={item.thinkingLevel}
            workingDirectory={item.workingDirectory}
            status={item.status}
            eventBus={item.eventBus}
          />
        </div>
      );
    case 'context-compaction': {
      if (item.status === 'in-progress') {
        return (
          <div
            className={clsx(styles.assistantMessage, styles.fullWidthMessage)}
          >
            <ContextCompactionBlock status='in-progress' />
          </div>
        );
      }
      if (item.status === 'done') {
        return (
          <div
            className={clsx(styles.assistantMessage, styles.fullWidthMessage)}
          >
            <ContextCompactionBlock
              status='done'
              beforeTokens={item.beforeTokens}
              afterTokens={item.afterTokens}
              summary={item.summary}
            />
          </div>
        );
      }
      return (
        <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
          <ContextCompactionBlock
            status='failed'
            errorMessage={item.errorMessage}
          />
        </div>
      );
    }
  }
}
