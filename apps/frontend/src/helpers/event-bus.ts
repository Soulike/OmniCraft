type Listener<T> = (data: T) => void;

/** Generic typed event emitter. */
export class EventBus<EventMap extends {[K in keyof EventMap]: unknown}> {
  private readonly listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>,
  ): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
  }

  off<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof EventMap>(
    ...args: EventMap[K] extends undefined
      ? [event: K]
      : [event: K, data: EventMap[K]]
  ): void {
    const [event, data] = args as [K, EventMap[K]];
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      (listener as Listener<EventMap[K]>)(data);
    }
  }
}
