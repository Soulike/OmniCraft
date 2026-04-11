import {ListBox, Select} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {Lightbulb} from 'lucide-react';

import styles from './styles.module.css';

const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const THINKING_LEVELS = Object.entries(THINKING_LEVEL_LABELS) as [
  ThinkingLevel,
  string,
][];

interface ThinkingLevelSelectProps {
  value: ThinkingLevel;
  isDisabled: boolean;
  onChange: (value: ThinkingLevel) => void;
}

export function ThinkingLevelSelect({
  value,
  isDisabled,
  onChange,
}: ThinkingLevelSelectProps) {
  return (
    <Select
      aria-label='Thinking level'
      className={styles.select}
      isDisabled={isDisabled}
      value={value}
      onChange={(selected) => {
        if (selected) {
          onChange(selected as ThinkingLevel);
        }
      }}
    >
      <Select.Trigger>
        <Select.Value>
          <span className={styles.value}>
            <Lightbulb size={14} />
            {`Thinking: ${THINKING_LEVEL_LABELS[value]}`}
          </span>
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {THINKING_LEVELS.map(([id, label]) => (
            <ListBox.Item key={id} id={id} textValue={label}>
              {label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
