export enum PathValidationError {
  NOT_ABSOLUTE = 'NOT_ABSOLUTE',
  DUPLICATE = 'DUPLICATE',
  NOT_FOUND = 'NOT_FOUND',
  NOT_DIRECTORY = 'NOT_DIRECTORY',
  NOT_READABLE = 'NOT_READABLE',
  NOT_READABLE_AND_WRITABLE = 'NOT_READABLE_AND_WRITABLE',
}

export interface InvalidPathEntry {
  path: string;
  reason: PathValidationError;
}
