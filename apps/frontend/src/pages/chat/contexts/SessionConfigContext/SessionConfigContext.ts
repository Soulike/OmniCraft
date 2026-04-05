import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {createContext} from 'react';

interface SessionConfigContextValue {
  readonly allAllowedPathsFromSettings: readonly AllowedPathEntry[];
  readonly isLoading: boolean;
  readonly loadError: unknown;
  readonly selectedWorkspace: string | undefined;
  readonly selectedExtraAllowedPaths: readonly string[];
  readonly selectedExtraAllowedPathEntries: readonly AllowedPathEntry[];
  readonly setSelectedWorkspace: (workspace: string | undefined) => void;
  readonly setSelectedExtraAllowedPaths: (paths: string[]) => void;
}

export type {SessionConfigContextValue};
export const SessionConfigContext =
  createContext<SessionConfigContextValue | null>(null);
