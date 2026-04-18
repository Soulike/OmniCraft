import assert from 'node:assert';

import {describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {todoAppendTool} from './todo-append.js';
import {todoClearTool} from './todo-clear.js';
import {todoListTool} from './todo-list.js';
import {todoUpdateTool} from './todo-update.js';

describe('todo tools', () => {
  describe('todo_append', () => {
    it('has the correct name', () => {
      expect(todoAppendTool.name).toBe('todo_append');
    });

    it('appends an item and returns full list', async () => {
      const ctx = createMockContext();
      const result = await todoAppendTool.execute(
        {subject: 'Task A', description: 'Do A'},
        ctx,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]).toEqual({
        index: 0,
        subject: 'Task A',
        description: 'Do A',
        status: 'pending',
      });
    });

    it('suppresses tool events', () => {
      expect(todoAppendTool.suppressToolEvents).toBe(true);
    });
  });

  describe('todo_update', () => {
    it('has the correct name', () => {
      expect(todoUpdateTool.name).toBe('todo_update');
    });

    it('updates item status', async () => {
      const ctx = createMockContext();
      await todoAppendTool.execute(
        {subject: 'Task A', description: 'Do A'},
        ctx,
      );
      const result = await todoUpdateTool.execute(
        {index: 0, status: 'in_progress'},
        ctx,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.items[0].status).toBe('in_progress');
    });

    it('fails on out-of-bounds index', async () => {
      const ctx = createMockContext();
      await todoAppendTool.execute(
        {subject: 'Task A', description: 'Do A'},
        ctx,
      );
      const result = await todoUpdateTool.execute(
        {index: 99, status: 'completed'},
        ctx,
      );

      expect(result.status).toBe('failure');
    });

    it('fails when called without prior observation', async () => {
      const ctx = createMockContext();
      const result = await todoUpdateTool.execute(
        {index: 0, status: 'completed'},
        ctx,
      );
      expect(result.status).toBe('failure');
    });

    it('updates subject and description', async () => {
      const ctx = createMockContext();
      await todoAppendTool.execute(
        {subject: 'Old', description: 'Old desc'},
        ctx,
      );
      const result = await todoUpdateTool.execute(
        {index: 0, subject: 'New', description: 'New desc'},
        ctx,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.items[0].subject).toBe('New');
      expect(result.data.items[0].description).toBe('New desc');
    });
  });

  describe('todo_clear', () => {
    it('has the correct name', () => {
      expect(todoClearTool.name).toBe('todo_clear');
    });

    it('clears all items', async () => {
      const ctx = createMockContext();
      await todoAppendTool.execute(
        {subject: 'Task A', description: 'Do A'},
        ctx,
      );
      const result = await todoClearTool.execute({}, ctx);

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.items).toHaveLength(0);
    });

    it('fails when called without prior observation', async () => {
      const ctx = createMockContext();
      const result = await todoClearTool.execute({}, ctx);
      expect(result.status).toBe('failure');
    });
  });

  describe('todo_list', () => {
    it('has the correct name', () => {
      expect(todoListTool.name).toBe('todo_list');
    });

    it('returns empty list initially', async () => {
      const ctx = createMockContext();
      const result = await todoListTool.execute({}, ctx);

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.items).toEqual([]);
    });

    it('returns all items', async () => {
      const ctx = createMockContext();
      await todoAppendTool.execute({subject: 'A', description: 'a'}, ctx);
      await todoAppendTool.execute({subject: 'B', description: 'b'}, ctx);
      const result = await todoListTool.execute({}, ctx);

      assert(result.status === 'success');
      expect(result.data.items).toHaveLength(2);
    });
  });

  describe('content format', () => {
    it('formats content string with status summary', async () => {
      const ctx = createMockContext();
      await todoAppendTool.execute(
        {subject: 'Task A', description: 'Do A'},
        ctx,
      );
      await todoAppendTool.execute(
        {subject: 'Task B', description: 'Do B'},
        ctx,
      );
      await todoUpdateTool.execute({index: 0, status: 'completed'}, ctx);

      const result = await todoListTool.execute({}, ctx);

      expect(result.content).toContain('1/2 completed');
      expect(result.content).toContain('[completed] #0: Task A');
      expect(result.content).toContain('[pending] #1: Task B');
    });

    it('shows empty message for empty list', async () => {
      const ctx = createMockContext();
      const result = await todoListTool.execute({}, ctx);

      expect(result.content).toContain('empty');
    });
  });
});
