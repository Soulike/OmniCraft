import {ListBox, Select} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {Lightbulb} from 'lucide-react';

import {
  getThinkingLevelLabel,
  getThinkingLevelOptions,
} from '@/helpers/thinking-level.js';

import styles from './styles.module.css';

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
            {`Thinking: ${getThinkingLevelLabel(value)}`}
          </span>
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {getThinkingLevelOptions().map(([id, label]) => (
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
