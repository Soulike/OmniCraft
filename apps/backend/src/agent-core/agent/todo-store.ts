import assert from 'node:assert';

/** Status values for a todo item. */
export type TodoStatus = 'pending' | 'in_progress' | 'completed';

/** A single todo item in the store. */
export interface TodoItem {
  readonly index: number;
  readonly subject: string;
  readonly description: string;
  readonly status: TodoStatus;
}

/** Fields that can be updated on a todo item. */
export interface TodoUpdateFields {
  readonly subject?: string;
  readonly description?: string;
  readonly status?: TodoStatus;
}

/**
 * In-memory, per-agent todo list.
 *
 * Items are stored in an array indexed by position. Exposes a `version`
 * counter that increments on every mutation, allowing callers to detect
 * stale state.
 */
export class TodoStore {
  private items: TodoItem[] = [];

  private _version = 0;

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
}
