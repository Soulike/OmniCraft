import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {ToolDefinition} from '../tool/types.js';
import {ToolSetDefinition} from './tool-set-definition.js';
import {ToolSetRegistry} from './tool-set-registry.js';

function createMockTool(name: string): ToolDefinition {
  return {
    name,
    displayName: `Mock: ${name}`,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    execute: () => Promise.resolve('ok'),
  };
}

class TestToolSet extends ToolSetDefinition {
  constructor(name: string, description: string, tools: ToolDefinition[]) {
    super({name, description});
    for (const tool of tools) {
      this.register(tool);
    }
  }
}

class TestToolSetRegistry extends ToolSetRegistry {
  static createForTest(): TestToolSetRegistry {
    return new TestToolSetRegistry();
  }

  /** Exposes protected register for testing. */
  public override register(toolSet: ToolSetDefinition): void {
    super.register(toolSet);
  }
}

describe('ToolSetRegistry', () => {
  it('registers and retrieves a tool set by name', () => {
    const registry = TestToolSetRegistry.createForTest();
    const toolSet = new TestToolSet('test_set', 'A test', [
      createMockTool('tool_a'),
    ]);
    registry.register(toolSet);
    expect(registry.get('test_set')).toBe(toolSet);
  });

  it('returns undefined for unknown tool set name', () => {
    const registry = TestToolSetRegistry.createForTest();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('returns all registered tool sets', () => {
    const registry = TestToolSetRegistry.createForTest();
    const set1 = new TestToolSet('set_1', 'Set 1', [createMockTool('tool_1')]);
    const set2 = new TestToolSet('set_2', 'Set 2', [createMockTool('tool_2')]);
    registry.register(set1);
    registry.register(set2);
    expect(registry.getAll()).toEqual([set1, set2]);
  });

  it('throws when registering duplicate tool set name', () => {
    const registry = TestToolSetRegistry.createForTest();
    const set1 = new TestToolSet('dupe', 'First', [createMockTool('tool_a')]);
    const set2 = new TestToolSet('dupe', 'Second', [createMockTool('tool_b')]);
    registry.register(set1);
    expect(() => {
      registry.register(set2);
    }).toThrow('ToolSet "dupe" is already registered');
  });

  it('allows registering the same instance twice (idempotent)', () => {
    const registry = TestToolSetRegistry.createForTest();
    const toolSet = new TestToolSet('same', 'Same', [createMockTool('tool_a')]);
    registry.register(toolSet);
    registry.register(toolSet);
    expect(registry.getAll()).toHaveLength(1);
  });
});
