import {Chip, Separator, Tooltip} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {TriangleAlert} from 'lucide-react';

import styles from './styles.module.css';

interface AccessInfoProps {
  workspace?: string;
  extraPaths: readonly AllowedPathEntry[];
  warning?: string;
}

export function AccessInfo({workspace, extraPaths, warning}: AccessInfoProps) {
  return (
    <div className={styles.container}>
      {warning && (
        <Tooltip delay={0}>
          <span className={styles.warningIcon}>
            <TriangleAlert size={14} />
          </span>
          <Tooltip.Content>
            <p>{warning}</p>
          </Tooltip.Content>
        </Tooltip>
      )}
      {workspace && <span className={styles.item}>Workspace: {workspace}</span>}
      {workspace && extraPaths.length > 0 && (
        <>
          <Separator orientation='vertical' />
          <Tooltip delay={0}>
            <span className={styles.extraPaths}>
              {extraPaths.length} extra{' '}
              {extraPaths.length === 1 ? 'path' : 'paths'}
            </span>
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
