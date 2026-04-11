import {ListBox, Select} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {Lightbulb} from 'lucide-react';

import styles from './styles.module.css';

const THINKING_LEVEL_OPTIONS: readonly {
  id: ThinkingLevel;
  label: string;
}[] = [
  {id: 'none', label: 'None'},
  {id: 'low', label: 'Low'},
  {id: 'medium', label: 'Medium'},
  {id: 'high', label: 'High'},
];

function getLabel(id: ThinkingLevel): string {
  return THINKING_LEVEL_OPTIONS.find((o) => o.id === id)?.label ?? 'None';
}

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
            {`Thinking: ${getLabel(value)}`}
          </span>
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {THINKING_LEVEL_OPTIONS.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
