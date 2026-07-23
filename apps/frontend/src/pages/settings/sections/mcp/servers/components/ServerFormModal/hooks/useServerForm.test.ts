import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useServerForm} from './useServerForm.js';

describe('useServerForm', () => {
  it('builds a stdio server from filled fields', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('fs');
      result.current.setCommand('npx');
      result.current.setArgs(['-y', '']);
      result.current.setEnvEntries([
        ['NODE_ENV', 'production'],
        ['', 'ignored'],
      ]);
    });
    let server: unknown;
    act(() => {
      server = result.current.validate();
    });
    expect(server).toEqual({
      name: 'fs',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y'],
        env: {NODE_ENV: 'production'},
      },
    });
  });

  it('builds an http server', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('remote');
      result.current.setTransportType('http');
      result.current.setUrl('https://mcp.example.com/mcp');
      result.current.setHeaderEntries([['Authorization', 'Bearer x']]);
    });
    let server: unknown;
    act(() => {
      server = result.current.validate();
    });
    expect(server).toEqual({
      name: 'remote',
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: {Authorization: 'Bearer x'},
      },
    });
  });

  it('rejects a duplicate name', () => {
    const {result} = renderHook(() => useServerForm({existingNames: ['fs']}));
    act(() => {
      result.current.setName('fs');
      result.current.setCommand('npx');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.name).toMatch(/already exists/);
  });

  it('rejects an invalid name', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('Bad Name');
      result.current.setCommand('npx');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.name).toBeDefined();
  });

  it('requires a command for stdio', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('fs');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.command).toBeDefined();
  });

  it('requires a valid url for http', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('remote');
      result.current.setTransportType('http');
      result.current.setUrl('not-a-url');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.url).toBeDefined();
  });

  it('clears the other transport fields on switch but keeps the name', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('fs');
      result.current.setCommand('npx');
    });
    act(() => {
      result.current.setTransportType('http');
    });
    expect(result.current.name).toBe('fs');
    expect(result.current.command).toBe('');
  });

  it('hydrates from an initial server for edit', () => {
    const {result} = renderHook(() =>
      useServerForm({
        existingNames: [],
        initial: {
          name: 'fs',
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['a'],
            env: {K: 'v'},
          },
        },
      }),
    );
    expect(result.current.isEdit).toBe(true);
    expect(result.current.name).toBe('fs');
    expect(result.current.command).toBe('node');
    expect(result.current.args).toEqual(['a']);
    expect(result.current.envEntries).toEqual([['K', 'v']]);
  });
});
