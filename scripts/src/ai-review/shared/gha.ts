import {appendFileSync} from 'node:fs';

/**
 * Reads a required environment variable, throwing a clear error when it is
 * unset or blank. Orchestrators run only inside GitHub Actions, where these
 * are always provided by the workflow.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Required environment variable ${name} is unset or empty.`);
  }
  return value;
}

/** Reads an optional environment variable, returning `''` when unset. */
export function optionalEnv(name: string): string {
  return process.env[name] ?? '';
}

/**
 * Writes a single `name=value` step output to the `$GITHUB_OUTPUT` file.
 * Values must be single-line (SHAs, booleans, short JSON) — sufficient for
 * every output this gate produces.
 */
export function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file === undefined || file === '') {
    throw new Error(
      'GITHUB_OUTPUT is not set; not running under GitHub Actions.',
    );
  }
  if (value.includes('\n')) {
    throw new Error(`Output ${name} must be single-line.`);
  }
  appendFileSync(file, `${name}=${value}\n`);
}

/** Prints an error message and exits the process with code 1. */
export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
