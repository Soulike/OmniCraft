import {describe, expect, it} from 'vitest';

import {TodoStore} from './todo-store.js';

describe('TodoStore', () => {
  describe('append', () => {
    it('appends an item with status pending and returns full list', () => {
      const store = new TodoStore();
      const items = store.append('Task A', 'Do A');

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        index: 0,
        subject: 'Task A',
        description: 'Do A',
        status: 'pending',
      });
    });

    it('appends multiple items with sequential indices', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      const items = store.append('Task B', 'Do B');

      expect(items).toHaveLength(2);
      expect(items[0].index).toBe(0);
      expect(items[1].index).toBe(1);
    });
  });

  describe('update', () => {
    it('updates status of an existing item', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      // Observed via append, so update is allowed
      const items = store.update(0, {status: 'in_progress'});

      expect(items[0].status).toBe('in_progress');
    });

    it('updates subject and description', () => {
      const store = new TodoStore();
      store.append('Old', 'Old desc');
      const items = store.update(0, {
        subject: 'New',
        description: 'New desc',
      });

      expect(items[0].subject).toBe('New');
      expect(items[0].description).toBe('New desc');
    });

    it('throws on out-of-bounds index', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      expect(() => store.update(5, {status: 'completed'})).toThrow();
    });

    it('throws when list has never been observed', () => {
      const store = new TodoStore();
      // update on empty store should fail with out-of-bounds or version check
      expect(() => store.update(0, {status: 'completed'})).toThrow();
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.append('Task B', 'Do B');
      const items = store.clear();

      expect(items).toHaveLength(0);
    });

    it('resets indices so next append starts at 0', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.clear();
      const items = store.append('Task B', 'Do B');

      expect(items).toHaveLength(1);
      expect(items[0].index).toBe(0);
    });
  });

  describe('list', () => {
    it('returns empty array when no items', () => {
      const store = new TodoStore();
      expect(store.list()).toEqual([]);
    });

    it('returns all items', () => {
      const store = new TodoStore();
      store.append('A', 'a');
      store.append('B', 'b');
      const items = store.list();

      expect(items).toHaveLength(2);
    });

    it('returns a copy, not the internal array', () => {
      const store = new TodoStore();
      store.append('A', 'a');
      const list1 = store.list();
      const list2 = store.list();

      expect(list1).not.toBe(list2);
    });
  });

  describe('version tracking', () => {
    it('allows update after append (append observes the list)', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      expect(() => store.update(0, {status: 'in_progress'})).not.toThrow();
    });

    it('allows update after list (list observes the list)', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.append('Task B', 'Do B');
      store.list();
      expect(() => store.update(0, {status: 'completed'})).not.toThrow();
    });

    it('allows clear after list', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.list();
      expect(() => store.clear()).not.toThrow();
    });
  });
});
