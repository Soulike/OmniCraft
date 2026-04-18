import {describe, expect, it} from 'vitest';

import {TodoStore} from './todo-store.js';

describe('TodoStore', () => {
  describe('append', () => {
    it('appends an item with status pending', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      const items = store.list();

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
      store.append('Task B', 'Do B');
      const items = store.list();

      expect(items).toHaveLength(2);
      expect(items[0].index).toBe(0);
      expect(items[1].index).toBe(1);
    });

    it('increments version', () => {
      const store = new TodoStore();
      expect(store.version).toBe(0);
      store.append('Task A', 'Do A');
      expect(store.version).toBe(1);
      store.append('Task B', 'Do B');
      expect(store.version).toBe(2);
    });
  });

  describe('update', () => {
    it('updates status of an existing item', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.update(0, {status: 'in_progress'});
      const items = store.list();

      expect(items[0].status).toBe('in_progress');
    });

    it('updates subject and description', () => {
      const store = new TodoStore();
      store.append('Old', 'Old desc');
      store.update(0, {subject: 'New', description: 'New desc'});
      const items = store.list();

      expect(items[0].subject).toBe('New');
      expect(items[0].description).toBe('New desc');
    });

    it('throws on out-of-bounds index', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      expect(() => {
        store.update(5, {status: 'completed'});
      }).toThrow();
    });

    it('increments version', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      const before = store.version;
      store.update(0, {status: 'completed'});
      expect(store.version).toBe(before + 1);
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.append('Task B', 'Do B');
      store.clear();
      const items = store.list();

      expect(items).toHaveLength(0);
    });

    it('resets indices so next append starts at 0', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.clear();
      store.append('Task B', 'Do B');
      const items = store.list();

      expect(items).toHaveLength(1);
      expect(items[0].index).toBe(0);
    });

    it('increments version', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      const before = store.version;
      store.clear();
      expect(store.version).toBe(before + 1);
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

    it('does not increment version', () => {
      const store = new TodoStore();
      store.append('A', 'a');
      const before = store.version;
      store.list();
      expect(store.version).toBe(before);
    });
  });
});
