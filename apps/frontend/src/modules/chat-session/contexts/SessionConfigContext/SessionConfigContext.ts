import type {Workspace} from '@omnicraft/settings-schema';
import {createContext} from 'react';

interface SessionConfigContextValue {
  readonly workspaces: readonly Workspace[];
  readonly isLoading: boolean;
  readonly loadError: unknown;
  readonly selectedWorkspace: string | undefined;
  readonly setSelectedWorkspace: (workspace: string | undefined) => void;
}

export type {SessionConfigContextValue};
export const SessionConfigContext =
  createContext<SessionConfigContextValue | null>(null);
