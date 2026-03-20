import type {BuildConfig} from 'bun';

const defaultConfig: Omit<BuildConfig, 'entrypoints'> = {
  target: 'bun',
  minify: true,
  sourcemap: 'linked',
  outdir: './dist',
};

export function createServerBuildConfig(
  entrypoints: string[],
  overrides?: Partial<BuildConfig>,
): BuildConfig {
  return {
    ...defaultConfig,
    ...overrides,
    entrypoints,
  };
}

export async function buildServer(config: BuildConfig): Promise<void> {
  const result = await Bun.build(config);

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log('Build succeeded');
}
