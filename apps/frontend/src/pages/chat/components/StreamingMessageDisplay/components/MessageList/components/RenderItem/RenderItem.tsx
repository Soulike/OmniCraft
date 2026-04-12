import {TOOL_NAME} from '@omnicraft/tool-schemas';
import clsx from 'clsx';
import {use} from 'react';

import {SessionIdContext} from '../../../../contexts/SessionIdContext/index.js';
import {formatTimestamp} from '../../helpers/formatTimestamp.js';
import type {MessageRenderItem} from '../../hooks/useMessageList.js';
import {AskUserCard} from '../AskUserCard/index.js';
import {MessageBubble} from '../MessageBubble/index.js';
import {ThinkingBlock} from '../ThinkingBlock/index.js';
import {ToolExecutionCard} from '../ToolExecutionCard/index.js';
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
        if (sessionId === null) {
          throw new Error('AskUserCard requires a sessionId');
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
      return (
        <div className={styles.assistantMessage}>
          <ThinkingBlock content={item.content} done={item.done} />
        </div>
      );
  }
}
