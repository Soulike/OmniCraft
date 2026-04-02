import {describe, expect, it, vi} from 'vitest';

import {createMockContext, createMockTool} from '../tool/testing.js';
import type {ToolDefinition} from '../tool/types.js';
import {loadToolSetTool} from './load-toolset.js';
import {ToolSetDefinition} from './tool-set-definition.js';

class TestToolSet extends ToolSetDefinition {
  constructor(name: string, description: string, tools: ToolDefinition[]) {
    super({name, description});
    for (const tool of tools) {
      this.register(tool);
    }
  }
}

describe('loadToolSetTool', () => {
  it('has the correct name and description', () => {
    expect(loadToolSetTool.name).toBe('load_toolset');
    expect(loadToolSetTool.description).toBeTruthy();
  });

  it('loads a tool set and returns summary', () => {
    const toolSet = new TestToolSet('file_ops', 'File operations', [
      createMockTool('read_file'),
      createMockTool('write_file'),
    ]);
    const loadFn = vi.fn();
    const context = createMockContext({
      availableToolSets: new Map([[toolSet.name, toolSet]]),
      loadToolSetToAgent: loadFn,
    });

    const result = loadToolSetTool.execute({name: 'file_ops'}, context);

    expect(result).toContain('file_ops');
    expect(result).toContain('read_file');
    expect(result).toContain('write_file');
    expect(loadFn).toHaveBeenCalledWith(toolSet);
  });

  it('returns error when tool set is not found', () => {
    const result = loadToolSetTool.execute(
      {name: 'nonexistent'},
      createMockContext(),
    );

    expect(result).toContain('not found');
    expect(result).toContain('nonexistent');
  });

  it('returns hint when tool set is already loaded', () => {
    const toolSet = new TestToolSet('file_ops', 'File operations', [
      createMockTool('read_file'),
    ]);
    const loadFn = vi.fn();
    const context = createMockContext({
      availableToolSets: new Map([[toolSet.name, toolSet]]),
      loadedToolSets: new Set([toolSet]),
      loadToolSetToAgent: loadFn,
    });

    const result = loadToolSetTool.execute({name: 'file_ops'}, context);

    expect(result).toContain('already loaded');
    expect(loadFn).not.toHaveBeenCalled();
  });
});
