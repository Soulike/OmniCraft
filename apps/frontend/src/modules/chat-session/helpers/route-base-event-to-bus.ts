import type {SseBaseEvent} from '@omnicraft/sse-events';

import type {ChatEventBus} from '../components/StreamingMessageDisplay/index.js';

/** Routes an SSE base event to a ChatEventBus. Each case narrows the event
 *  so TypeScript verifies the type↔payload correlation. */
export function routeBaseEventToBus(
  event: SseBaseEvent,
  bus: ChatEventBus,
): void {
  switch (event.type) {
    case 'text-delta':
      bus.emit(event.type, event);
      break;
    case 'tool-execute-start':
      bus.emit(event.type, event);
      break;
    case 'tool-execute-end':
      bus.emit(event.type, event);
      break;
    case 'tool-execute-delta':
      bus.emit(event.type, event);
      break;
    case 'message-start':
      bus.emit(event.type, event);
      break;
    case 'thinking-start':
      bus.emit(event.type, event);
      break;
    case 'thinking-delta':
      bus.emit(event.type, event);
      break;
    case 'thinking-end':
      bus.emit(event.type, event);
      break;
    case 'done':
      bus.emit(event.type, event);
      break;
    case 'context-compaction-start':
      bus.emit(event.type, event);
      break;
    case 'context-compaction-end':
      bus.emit(event.type, event);
      break;
    case 'context-compaction-error':
      bus.emit(event.type, event);
      break;
    case 'usage-update':
      bus.emit(event.type, event);
      break;
    case 'session-title':
      bus.emit(event.type, event);
      break;
    case 'todo-update':
      bus.emit(event.type, event);
      break;
    case 'error':
      bus.emit('stream-error', {message: event.message});
      break;
  }
}
