/** Renders a byte size in the same units both the compaction file list and
 *  the too-large-attachment placeholder show the model. */
export function formatAttachmentSize(lastKnownByteSize: number): string {
  if (lastKnownByteSize < 1024) return `${lastKnownByteSize.toString()} B`;
  if (lastKnownByteSize < 1024 * 1024) {
    return `${Math.round(lastKnownByteSize / 1024).toString()} KB`;
  }
  return `${(lastKnownByteSize / 1024 / 1024).toFixed(1)} MB`;
}
