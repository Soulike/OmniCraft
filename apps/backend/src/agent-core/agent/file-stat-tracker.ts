export enum FileStatCheckResult {
  OK = 'ok',
  NOT_READ = 'not_read',
  MODIFIED_SINCE_LAST_READ = 'modified_since_last_read',
}

interface FileStat {
  readonly size: number;
  readonly mtimeMs: number;
}

/** Tracks known file stats to prevent blind or stale modifications. */
export class FileStatTracker {
  private readonly entries = new Map<string, FileStat>();

  /** Record or update the known stat for a file. */
  set(absolutePath: string, size: number, mtimeMs: number): void {
    this.entries.set(absolutePath, {size, mtimeMs});
  }

  /**
   * Check if the file can be safely modified.
   * Clears the record on NOT_READ and MODIFIED_SINCE_LAST_READ.
   */
  canModify(
    absolutePath: string,
    currentSize: number,
    currentMtimeMs: number,
  ): FileStatCheckResult {
    const entry = this.entries.get(absolutePath);

    if (!entry) {
      return FileStatCheckResult.NOT_READ;
    }

    if (entry.size !== currentSize || entry.mtimeMs !== currentMtimeMs) {
      this.entries.delete(absolutePath);
      return FileStatCheckResult.MODIFIED_SINCE_LAST_READ;
    }

    return FileStatCheckResult.OK;
  }

  /** Remove the record for a file. */
  delete(absolutePath: string): void {
    this.entries.delete(absolutePath);
  }
}
