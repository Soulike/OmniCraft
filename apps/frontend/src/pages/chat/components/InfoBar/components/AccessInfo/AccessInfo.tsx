import {Button, Chip, Separator, Tooltip} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import styles from './styles.module.css';

interface AccessInfoProps {
  workspace: string;
  extraPaths: readonly AllowedPathEntry[];
}

export function AccessInfo({workspace, extraPaths}: AccessInfoProps) {
  return (
    <div className={styles.container}>
      <span className={styles.item}>Workspace: {workspace}</span>
      {extraPaths.length > 0 && (
        <>
          <Separator orientation='vertical' />
          <Tooltip delay={0}>
            <Button
              size='sm'
              variant='ghost'
              aria-label='Extra allowed paths'
              className={styles.extraPaths}
            >
              {extraPaths.length} extra{' '}
              {extraPaths.length === 1 ? 'path' : 'paths'}
            </Button>
            <Tooltip.Content>
              <div className={styles.tooltipContent}>
                {extraPaths.map((p) => (
                  <div key={p.path} className={styles.tooltipEntry}>
                    <span className={styles.tooltipPath}>{p.path}</span>
                    <Chip
                      size='sm'
                      color={p.mode === 'read-write' ? 'success' : 'default'}
                    >
                      {p.mode}
                    </Chip>
                  </div>
                ))}
              </div>
            </Tooltip.Content>
          </Tooltip>
        </>
      )}
    </div>
  );
}
