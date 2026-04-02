import fs from 'node:fs/promises';

const DEFAULT_MAX_FILE_SIZE_BYTES = 1_048_576; // 1MB
const DEFAULT_MAX_TOTAL_FILE_SIZE_BYTES = 10_485_760; // 10MB

interface CacheEntry {
  content: string;
  mtimeMs: number;
  size: number;
  byteLength: number;
}

interface FileContentCacheOptions {
  maxFileSizeBytes: number;
  maxTotalFileSizeBytes: number;
}

/** LRU cache for file contents with mtime/size validation. */
export class FileContentCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxFileSizeBytes: number;
  private readonly maxTotalFileSizeBytes: number;
  private currentTotalBytes = 0;

  constructor(options?: FileContentCacheOptions) {
    this.maxFileSizeBytes =
      options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    this.maxTotalFileSizeBytes =
      options?.maxTotalFileSizeBytes ?? DEFAULT_MAX_TOTAL_FILE_SIZE_BYTES;
  }

  /** Returns cached content if valid, or undefined if missing/stale. */
  async get(absolutePath: string): Promise<string | undefined> {
    const entry = this.entries.get(absolutePath);
    if (!entry) return undefined;

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      this.invalidate(absolutePath);
      return undefined;
    }

    if (stat.mtimeMs !== entry.mtimeMs || stat.size !== entry.size) {
      this.invalidate(absolutePath);
      return undefined;
    }

    // Move to end (most recently used)
    this.entries.delete(absolutePath);
    this.entries.set(absolutePath, entry);

    return entry.content;
  }

  /** Caches file content with current mtime/size. Skips files exceeding max file size. */
  async set(absolutePath: string, content: string): Promise<void> {
    const byteLength = Buffer.byteLength(content);
    if (byteLength > this.maxFileSizeBytes) return;

    this.invalidate(absolutePath);
    this.evictUntilFits(byteLength);

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return;
    }

    this.entries.set(absolutePath, {
      content,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      byteLength,
    });
    this.currentTotalBytes += byteLength;
  }

  /** Removes a cached entry. */
  invalidate(absolutePath: string): void {
    const entry = this.entries.get(absolutePath);
    if (!entry) return;
    this.currentTotalBytes -= entry.byteLength;
    this.entries.delete(absolutePath);
  }

  /** Evicts least recently used entries until `needed` bytes fit. */
  private evictUntilFits(needed: number): void {
    for (const [key, entry] of this.entries) {
      if (this.currentTotalBytes + needed <= this.maxTotalFileSizeBytes) break;
      this.currentTotalBytes -= entry.byteLength;
      this.entries.delete(key);
    }
  }
}
