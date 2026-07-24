import {Button, Input, TextField} from '@heroui/react';
import {Plus, Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface KeyValueEditorProps {
  entries: [string, string][];
  onChange: (entries: [string, string][]) => void;
  addLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  isDisabled?: boolean;
}

export function KeyValueEditor({
  entries,
  onChange,
  addLabel,
  keyPlaceholder,
  valuePlaceholder,
  isDisabled,
}: KeyValueEditorProps) {
  const setKey = (index: number, key: string) => {
    onChange(
      entries.map((entry, i) => (i === index ? [key, entry[1]] : entry)),
    );
  };
  const setValue = (index: number, value: string) => {
    onChange(
      entries.map((entry, i) => (i === index ? [entry[0], value] : entry)),
    );
  };
  const removeAt = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.list}>
      {entries.map(([key, value], index) => (
        // Row identity is positional; index key is intentional here.
        <div className={styles.row} key={index}>
          <TextField
            aria-label={`Key ${(index + 1).toString()}`}
            className={styles.key}
            value={key}
            isDisabled={isDisabled}
            onChange={(next) => {
              setKey(index, next);
            }}
          >
            <Input placeholder={keyPlaceholder} />
          </TextField>
          <TextField
            aria-label={`Value ${(index + 1).toString()}`}
            className={styles.value}
            value={value}
            isDisabled={isDisabled}
            onChange={(next) => {
              setValue(index, next);
            }}
          >
            <Input placeholder={valuePlaceholder} />
          </TextField>
          <Button
            aria-label={`Remove pair ${(index + 1).toString()}`}
            size='sm'
            variant='ghost'
            isDisabled={isDisabled}
            onPress={() => {
              removeAt(index);
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button
        fullWidth
        size='sm'
        variant='outline'
        isDisabled={isDisabled}
        onPress={() => {
          onChange([...entries, ['', '']]);
        }}
      >
        <Plus size={16} />
        {addLabel}
      </Button>
    </div>
  );
}
