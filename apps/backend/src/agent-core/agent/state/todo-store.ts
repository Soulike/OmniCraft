import assert from 'node:assert';

import type {SseTodoItem, SseTodoStatus} from '@omnicraft/sse-events';

/** A single todo item in the store. */
export interface TodoItem {
  readonly index: number;
  readonly subject: string;
  readonly description: string;
  readonly status: SseTodoStatus;
}

/** Fields that can be updated on a todo item. */
export interface TodoUpdateFields {
  readonly subject?: string;
  readonly description?: string;
  readonly status?: SseTodoStatus;
}

/**
 * In-memory, per-agent todo list.
 *
 * Items are stored in an array indexed by position. Exposes a `version`
 * counter that increments on every mutation, allowing callers to detect
 * stale state.
 */
export class TodoStore {
  private items: TodoItem[];

  private _version: number;

  /**
   * @param initialItems Items to restore from a snapshot. When non-empty, the
   *   version starts at 1 so it reads as "mutated since empty"; an empty or
   *   absent snapshot starts at version 0.
   */
  constructor(initialItems: readonly SseTodoItem[] = []) {
    this.items = initialItems.map((item) => ({...item}));
    this._version = initialItems.length === 0 ? 0 : 1;
  }

  /** Incremented on every mutation. Callers can compare against a saved value to detect staleness. */
  get version(): number {
    return this._version;
  }

  /** Appends one or more items, each with status `pending`. */
  append(items: readonly Pick<TodoItem, 'subject' | 'description'>[]): void {
    for (const {subject, description} of items) {
      this.items.push({
        index: this.items.length,
        subject,
        description,
        status: 'pending',
      });
    }
    this._version++;
  }

  /** Updates fields on an existing item. */
  update(index: number, fields: TodoUpdateFields): void {
    assert(
      index >= 0 && index < this.items.length,
      `Todo index ${index} is out of bounds (0..${this.items.length - 1}).`,
    );

    const current = this.items[index];
    this.items[index] = {
      index,
      subject: fields.subject ?? current.subject,
      description: fields.description ?? current.description,
      status: fields.status ?? current.status,
    };
    this._version++;
  }

  /** Clears all items. */
  clear(): void {
    this.items = [];
    this._version++;
  }

  /** Returns a snapshot of all items. */
  list(): TodoItem[] {
    return [...this.items];
  }

  /** Returns a serializable snapshot of all items. */
  toSnapshot(): SseTodoItem[] {
    return this.items.map((item) => ({...item}));
  }
}
