import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {ToolRegistry} from './tool-registry.js';
import type {ToolDefinition} from './types.js';

/** Concrete subclass for testing (no singleton — instantiated directly). */
class TestToolRegistry extends ToolRegistry {
  static createForTest(): TestToolRegistry {
    return new TestToolRegistry();
  }
}

function createMockTool(name: string): ToolDefinition {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    execute: () => Promise.resolve('ok'),
  };
}

describe('ToolRegistry', () => {
  it('registers and retrieves a tool by name', () => {
    const registry = TestToolRegistry.createForTest();
    const tool = createMockTool('test_tool');
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
  });

  it('returns undefined for unknown tool name', () => {
    const registry = TestToolRegistry.createForTest();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('returns all registered tools', () => {
    const registry = TestToolRegistry.createForTest();
    const tool1 = createMockTool('tool_1');
    const tool2 = createMockTool('tool_2');
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.getAll()).toEqual([tool1, tool2]);
  });

  it('throws when registering duplicate name', () => {
    const registry = TestToolRegistry.createForTest();
    const tool = createMockTool('duplicate');
    registry.register(tool);
    const tool2 = createMockTool('duplicate');
    expect(() => {
      registry.register(tool2);
    }).toThrow('Tool "duplicate" is already registered');
  });

  it('allows registering the same instance twice (idempotent)', () => {
    const registry = TestToolRegistry.createForTest();
    const tool = createMockTool('same');
    registry.register(tool);
    registry.register(tool);
    expect(registry.getAll()).toHaveLength(1);
  });
});
