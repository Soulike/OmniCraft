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
 * In-memory, per-agent todo list with version tracking.
 *
 * Items are stored in an array indexed by position. All mutating methods
 * return a snapshot of the full list. Mutating methods (`update`, `clear`)
 * enforce that the caller has observed the current list before making
 * changes — mirroring the FileStatTracker safety pattern.
 */
export class TodoStore {
  private items: TodoItem[] = [];
  private version = 0;
  private lastObservedVersion: number | undefined;

  /** Appends a new item with status `pending`. Returns the full list. */
  append(subject: string, description: string): TodoItem[] {
    const item: TodoItem = {
      index: this.items.length,
      subject,
      description,
      status: 'pending',
    };
    this.items.push(item);
    this.version++;
    this.lastObservedVersion = this.version;
    return this.list();
  }

  /** Updates fields on an existing item. Returns the full list. */
  update(index: number, fields: TodoUpdateFields): TodoItem[] {
    this.assertObserved();
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
    this.version++;
    this.lastObservedVersion = this.version;
    return this.list();
  }

  /** Clears all items. Returns the (empty) list. */
  clear(): TodoItem[] {
    this.assertObserved();
    this.items = [];
    this.version++;
    this.lastObservedVersion = this.version;
    return this.list();
  }

  /** Returns a snapshot of all items. */
  list(): TodoItem[] {
    this.lastObservedVersion = this.version;
    return [...this.items];
  }

  /** Throws if the caller has never observed the list. */
  private assertObserved(): void {
    assert(
      this.lastObservedVersion !== undefined &&
        this.lastObservedVersion === this.version,
      'Call todo_list first to see the current items before making changes.',
    );
  }
}
