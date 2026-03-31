import {EventEmitter} from 'node:events';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface EventBusEvents {}

class AppEventBus extends EventEmitter<EventBusEvents> {}

/** Global event bus for application-level cross-module communication. */
export const eventBus = new AppEventBus();
