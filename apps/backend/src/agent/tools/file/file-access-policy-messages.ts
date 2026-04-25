export const skippedByFileAccessPolicyMessage =
  'Some paths were skipped because they are blocked by file access policy. ' +
  'Do not try to bypass this policy. If accessing those paths is necessary, ' +
  'stop and ask the user to perform the operation manually.';

export function formatBlockedFileAccessMessage(requestedPath: string): string {
  return (
    `Error: Access denied by file access policy: ${requestedPath}. ` +
    'This operation would access a blocked sensitive path. ' +
    'Review the file access operation. If this operation is necessary, ' +
    'stop and ask the user to perform it manually.'
  );
}
