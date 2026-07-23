import {Chip, Spinner} from '@heroui/react';

import type {McpDisplayStatus} from '../../helpers/merge-servers.js';

interface StatusChipProps {
  status: McpDisplayStatus;
}

type ChipColor = 'success' | 'danger' | 'warning' | 'default';

const STATUS_CONFIG: Record<
  McpDisplayStatus,
  {label: string; color: ChipColor}
> = {
  connected: {label: 'connected', color: 'success'},
  error: {label: 'error', color: 'danger'},
  connecting: {label: 'connecting', color: 'warning'},
  unknown: {label: 'unknown', color: 'default'},
  'not-enabled': {label: 'not enabled', color: 'default'},
};

export function StatusChip({status}: StatusChipProps) {
  const {label, color} = STATUS_CONFIG[status];
  return (
    <Chip color={color} variant='soft' size='sm'>
      {status === 'connecting' && <Spinner size='sm' color='current' />}
      {label}
    </Chip>
  );
}
