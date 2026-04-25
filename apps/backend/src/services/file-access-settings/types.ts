export enum PathValidationError {
  NOT_ABSOLUTE = 'NOT_ABSOLUTE',
  DUPLICATE = 'DUPLICATE',
  NOT_FOUND = 'NOT_FOUND',
  NOT_DIRECTORY = 'NOT_DIRECTORY',
  NOT_ACCESSIBLE = 'NOT_ACCESSIBLE',
  BLOCKED = 'BLOCKED',
}

export interface InvalidPathEntry {
  path: string;
  reason: PathValidationError;
}
