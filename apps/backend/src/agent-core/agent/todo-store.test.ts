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
  });

  describe('update', () => {
    it('updates status of an existing item', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.list(); // observe before update
      store.update(0, {status: 'in_progress'});
      const items = store.list();

      expect(items[0].status).toBe('in_progress');
    });

    it('updates subject and description', () => {
      const store = new TodoStore();
      store.append('Old', 'Old desc');
      store.list(); // observe before update
      store.update(0, {
        subject: 'New',
        description: 'New desc',
      });
      const items = store.list();

      expect(items[0].subject).toBe('New');
      expect(items[0].description).toBe('New desc');
    });

    it('throws on out-of-bounds index', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.list();
      expect(() => {
        store.update(5, {status: 'completed'});
      }).toThrow();
    });

    it('throws when list has never been observed', () => {
      const store = new TodoStore();
      // assertObserved() runs before the bounds check, so the version guard fires first
      expect(() => {
        store.update(0, {status: 'completed'});
      }).toThrow();
    });
  });

  describe('clear', () => {
    it('throws when called before any observation', () => {
      const store = new TodoStore();
      expect(() => {
        store.clear();
      }).toThrow();
    });

    it('removes all items', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.append('Task B', 'Do B');
      store.list(); // observe before clear
      store.clear();
      const items = store.list();

      expect(items).toHaveLength(0);
    });

    it('resets indices so next append starts at 0', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.list();
      store.clear();
      store.append('Task B', 'Do B');
      const items = store.list();

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
    it('allows update after list', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.list(); // observe
      expect(() => {
        store.update(0, {status: 'in_progress'});
      }).not.toThrow();
    });

    it('rejects update without prior list', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      // append does not observe, so update should fail
      expect(() => {
        store.update(0, {status: 'in_progress'});
      }).toThrow();
    });

    it('allows clear after list', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.list();
      expect(() => {
        store.clear();
      }).not.toThrow();
    });

    it('rejects update after mutation without re-listing', () => {
      const store = new TodoStore();
      store.append('Task A', 'Do A');
      store.append('Task B', 'Do B');
      store.list(); // observe version 2
      store.update(0, {status: 'completed'}); // version now 3
      // lastObservedVersion is 2 but version is 3
      expect(() => {
        store.update(1, {status: 'completed'});
      }).toThrow();
    });
  });
});
