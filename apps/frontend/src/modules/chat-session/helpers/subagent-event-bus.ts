import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventMap} from '../components/StreamingMessageDisplay/index.js';

type Listener<T> = (data: T) => void;

type ChatEventEntry = {
  [K in keyof ChatEventMap]: {event: K; data: ChatEventMap[K]};
}[keyof ChatEventMap];

interface ListenerRecord {
  event: keyof ChatEventMap;
  listener: Listener<unknown>;
  nextReplayIndex: number;
}

/**
 * Event bus used only for subagent transcript forwarding.
 *
 * During SSE replay, `subagent-output` events can be forwarded before the
 * nested subagent display has mounted and registered its listeners. A plain
 * EventBus would drop those early events, leaving the replayed subagent body
 * blank. This bus keeps a small per-subagent history so late listeners can
 * receive the already-forwarded transcript while preserving the existing
 * parent-stream-to-child-bus data flow.
 */
export class SubagentEventBus extends EventBus<ChatEventMap> {
  private readonly history: ChatEventEntry[] = [];
  private readonly listenerRecords = new Set<ListenerRecord>();
  private replayScheduled = false;

  override on<K extends keyof ChatEventMap>(
    event: K,
    listener: Listener<ChatEventMap[K]>,
  ): void {
    const storedListener = listener as Listener<unknown>;
    for (const record of this.listenerRecords) {
      if (record.event === event && record.listener === storedListener) return;
    }

    this.listenerRecords.add({
      event,
      listener: storedListener,
      nextReplayIndex: 0,
    });

    if (this.history.length > 0) {
      this.scheduleReplay();
    }
  }

  override off<K extends keyof ChatEventMap>(
    event: K,
    listener: Listener<ChatEventMap[K]>,
  ): void {
    const storedListener = listener as Listener<unknown>;
    for (const record of this.listenerRecords) {
      if (record.event === event && record.listener === storedListener) {
        this.listenerRecords.delete(record);
      }
    }
  }

  override emit<K extends keyof ChatEventMap>(
    ...args: ChatEventMap[K] extends undefined
      ? [event: K]
      : [event: K, data: ChatEventMap[K]]
  ): void {
    this.flushReplay();

    const [event, data] = args as [K, ChatEventMap[K]];
    this.history.push({event, data} as ChatEventEntry);

    const nextReplayIndex = this.history.length;
    for (const record of this.listenerRecords) {
      if (record.event !== event) continue;
      record.listener(data);
      record.nextReplayIndex = nextReplayIndex;
    }
  }

  private scheduleReplay(): void {
    if (this.replayScheduled) return;
    this.replayScheduled = true;
    queueMicrotask(() => {
      this.replayScheduled = false;
      this.flushReplay();
    });
  }

  private flushReplay(): void {
    if (!this.hasPendingReplay()) return;

    for (let index = 0; index < this.history.length; index++) {
      const entry = this.history[index];
      for (const record of this.listenerRecords) {
        if (record.nextReplayIndex > index) continue;
        if (record.event === entry.event) {
          record.listener(entry.data);
        }
        record.nextReplayIndex = index + 1;
      }
    }
  }

  private hasPendingReplay(): boolean {
    for (const record of this.listenerRecords) {
      if (record.nextReplayIndex < this.history.length) return true;
    }
    return false;
  }
}
