import {describe, expect, it} from 'vitest';

import {TodoStore} from './todo-store.js';

describe('TodoStore', () => {
  describe('append', () => {
    it('appends a single item with status pending', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      const items = store.list();

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        index: 0,
        subject: 'Task A',
        description: 'Do A',
        status: 'pending',
      });
    });

    it('appends multiple items in one call with sequential indices', () => {
      const store = new TodoStore();
      store.append([
        {subject: 'Task A', description: 'Do A'},
        {subject: 'Task B', description: 'Do B'},
      ]);
      const items = store.list();

      expect(items).toHaveLength(2);
      expect(items[0].index).toBe(0);
      expect(items[1].index).toBe(1);
    });

    it('appends to existing items with correct indices', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      store.append([
        {subject: 'Task B', description: 'Do B'},
        {subject: 'Task C', description: 'Do C'},
      ]);
      const items = store.list();

      expect(items).toHaveLength(3);
      expect(items[0].index).toBe(0);
      expect(items[1].index).toBe(1);
      expect(items[2].index).toBe(2);
    });

    it('increments version once per call', () => {
      const store = new TodoStore();
      expect(store.version).toBe(0);
      store.append([
        {subject: 'Task A', description: 'Do A'},
        {subject: 'Task B', description: 'Do B'},
      ]);
      expect(store.version).toBe(1);
    });
  });

  describe('update', () => {
    it('updates status of an existing item', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      store.update(0, {status: 'in_progress'});
      const items = store.list();

      expect(items[0].status).toBe('in_progress');
    });

    it('updates subject and description', () => {
      const store = new TodoStore();
      store.append([{subject: 'Old', description: 'Old desc'}]);
      store.update(0, {subject: 'New', description: 'New desc'});
      const items = store.list();

      expect(items[0].subject).toBe('New');
      expect(items[0].description).toBe('New desc');
    });

    it('throws on out-of-bounds index', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      expect(() => {
        store.update(5, {status: 'completed'});
      }).toThrow();
    });

    it('increments version', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      const before = store.version;
      store.update(0, {status: 'completed'});
      expect(store.version).toBe(before + 1);
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      store.append([{subject: 'Task B', description: 'Do B'}]);
      store.clear();
      const items = store.list();

      expect(items).toHaveLength(0);
    });

    it('resets indices so next append starts at 0', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
      store.clear();
      store.append([{subject: 'Task B', description: 'Do B'}]);
      const items = store.list();

      expect(items).toHaveLength(1);
      expect(items[0].index).toBe(0);
    });

    it('increments version', () => {
      const store = new TodoStore();
      store.append([{subject: 'Task A', description: 'Do A'}]);
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
      store.append([{subject: 'A', description: 'a'}]);
      store.append([{subject: 'B', description: 'b'}]);
      const items = store.list();

      expect(items).toHaveLength(2);
    });

    it('returns a copy, not the internal array', () => {
      const store = new TodoStore();
      store.append([{subject: 'A', description: 'a'}]);
      const list1 = store.list();
      const list2 = store.list();

      expect(list1).not.toBe(list2);
    });

    it('does not increment version', () => {
      const store = new TodoStore();
      store.append([{subject: 'A', description: 'a'}]);
      const before = store.version;
      store.list();
      expect(store.version).toBe(before);
    });
  });

  describe('snapshot round-trip', () => {
    it('toSnapshot returns the current items', () => {
      const store = new TodoStore();
      store.append([
        {subject: 'Task A', description: 'Do A'},
        {subject: 'Task B', description: 'Do B'},
      ]);
      store.update(1, {status: 'in_progress'});

      expect(store.toSnapshot()).toEqual([
        {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
        {
          index: 1,
          subject: 'Task B',
          description: 'Do B',
          status: 'in_progress',
        },
      ]);
    });

    it('restores items from a snapshot passed to the constructor', () => {
      const source = new TodoStore();
      source.append([{subject: 'Task A', description: 'Do A'}]);
      source.update(0, {status: 'completed'});

      const restored = new TodoStore(source.toSnapshot());

      expect(restored.list()).toEqual(source.list());
    });

    it('seeds version to 1 when restoring a non-empty snapshot', () => {
      const restored = new TodoStore([
        {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
      ]);

      expect(restored.version).toBe(1);
    });

    it('keeps version at 0 when restoring an empty snapshot', () => {
      const restored = new TodoStore([]);

      expect(restored.version).toBe(0);
    });

    it('appends after a restore using indices past the restored items', () => {
      const restored = new TodoStore([
        {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
      ]);
      restored.append([{subject: 'Task B', description: 'Do B'}]);

      expect(restored.list()).toEqual([
        {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
        {index: 1, subject: 'Task B', description: 'Do B', status: 'pending'},
      ]);
    });
  });
});
