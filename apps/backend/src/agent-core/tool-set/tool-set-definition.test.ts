import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {ToolDefinition} from '../tool/types.js';
import {ToolSetDefinition} from './tool-set-definition.js';

function createMockTool(name: string): ToolDefinition {
  return {
    name,
    displayName: `Mock: ${name}`,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    execute: () => Promise.resolve('ok'),
  };
}

class TestToolSetDefinition extends ToolSetDefinition {
  /** Exposes protected register for testing. */
  public override register(tool: ToolDefinition): void {
    super.register(tool);
  }
}

describe('ToolSetDefinition', () => {
  it('stores name and description', () => {
    const toolSet = new TestToolSetDefinition({
      name: 'test_set',
      description: 'A test tool set',
    });
    expect(toolSet.name).toBe('test_set');
    expect(toolSet.description).toBe('A test tool set');
  });

  it('registers and returns tools', () => {
    const toolSet = new TestToolSetDefinition({
      name: 'test_set',
      description: 'A test tool set',
    });
    const tool1 = createMockTool('tool_1');
    const tool2 = createMockTool('tool_2');
    toolSet.register(tool1);
    toolSet.register(tool2);
    expect(toolSet.getAll()).toEqual([tool1, tool2]);
  });

  it('throws when registering duplicate tool name', () => {
    const toolSet = new TestToolSetDefinition({
      name: 'test_set',
      description: 'A test tool set',
    });
    const tool = createMockTool('duplicate');
    toolSet.register(tool);
    const tool2 = createMockTool('duplicate');
    expect(() => {
      toolSet.register(tool2);
    }).toThrow('Tool "duplicate" is already registered in tool set "test_set"');
  });

  it('allows registering the same instance twice (idempotent)', () => {
    const toolSet = new TestToolSetDefinition({
      name: 'test_set',
      description: 'A test tool set',
    });
    const tool = createMockTool('same');
    toolSet.register(tool);
    toolSet.register(tool);
    expect(toolSet.getAll()).toHaveLength(1);
  });

  it('returns empty array when no tools registered', () => {
    const toolSet = new TestToolSetDefinition({
      name: 'empty_set',
      description: 'Empty',
    });
    expect(toolSet.getAll()).toEqual([]);
  });
});
