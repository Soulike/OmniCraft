import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {createContext} from 'react';

interface SessionConfigContextValue {
  /** All allowed paths from settings. */
  readonly allowedPaths: readonly AllowedPathEntry[];
  /** Whether allowed paths are still loading. */
  readonly pathsLoading: boolean;
  /** Error from loading allowed paths, if any. */
  readonly pathsError: string | null;
  /** Selected workspace path (undefined if none). */
  readonly workspace: string | undefined;
  /** Selected extra allowed path strings. */
  readonly extraAllowedPaths: readonly string[];
  /** Resolved extra paths with modes (derived from allowedPaths + extraAllowedPaths). */
  readonly resolvedExtraPaths: readonly AllowedPathEntry[];
  /** Set the workspace path. Only used by SessionConfigBar. */
  readonly setWorkspace: (workspace: string | undefined) => void;
  /** Set the extra allowed paths. Only used by SessionConfigBar. */
  readonly setExtraAllowedPaths: (paths: string[]) => void;
}

export type {SessionConfigContextValue};
export const SessionConfigContext =
  createContext<SessionConfigContextValue | null>(null);
