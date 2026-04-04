import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {webSearchTool} from './web-search.js';

describe('webSearchTool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
    fs.mkdirSync(tmpDir, {recursive: true});
    await SettingsManager.create(path.join(tmpDir, 'settings.json'));
  });

  afterEach(() => {
    SettingsManager.resetInstanceForTesting();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

  it('has the correct name', () => {
    expect(webSearchTool.name).toBe('web_search');
  });

  it('returns error when API key is not configured', async () => {
    const result = await webSearchTool.execute(
      {query: 'test query'},
      createMockContext(),
    );
    expect(result).toContain('Error:');
    expect(result).toContain('Tavily API key is not configured');
  });
});
