/** Renders a byte size in the same units both the compaction file list and
 *  the too-large-attachment placeholder show the model. */
export function formatAttachmentSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize.toString()} B`;
  if (byteSize < 1024 * 1024) {
    return `${Math.round(byteSize / 1024).toString()} KB`;
  }
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}
