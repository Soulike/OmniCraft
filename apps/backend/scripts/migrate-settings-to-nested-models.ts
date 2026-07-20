import {copyFile, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {migrateSettings} from './migrate-settings-lib.js';

const dataDir = process.env.DATA_DIR ?? path.join(os.homedir(), '.omni-craft');
const settingsPath = path.join(dataDir, 'settings.json');

const raw = JSON.parse(await readFile(settingsPath, 'utf-8')) as Record<
  string,
  unknown
>;
await copyFile(settingsPath, `${settingsPath}.pre-nested-migration.bak`);
const migrated = migrateSettings(raw);
await writeFile(settingsPath, JSON.stringify(migrated, null, 2) + '\n');
process.stdout.write(
  `Migrated ${settingsPath} (backup at ${settingsPath}.pre-nested-migration.bak)\n`,
);
