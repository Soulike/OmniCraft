import {Button, Input, TextField} from '@heroui/react';
import {Plus, Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface StringListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  /** Singular noun for one row, used to build accessibility labels. */
  itemLabel: string;
  placeholder?: string;
  isDisabled?: boolean;
}

export function StringListEditor({
  items,
  onChange,
  addLabel,
  itemLabel,
  placeholder,
  isDisabled,
}: StringListEditorProps) {
  const setAt = (index: number, value: string) => {
    onChange(items.map((item, i) => (i === index ? value : item)));
  };
  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.list}>
      {items.map((item, index) => (
        // Row identity is positional; index key is intentional here.
        <div className={styles.row} key={index}>
          <TextField
            aria-label={`${itemLabel} ${(index + 1).toString()}`}
            className={styles.input}
            value={item}
            isDisabled={isDisabled}
            onChange={(value) => {
              setAt(index, value);
            }}
          >
            <Input placeholder={placeholder} />
          </TextField>
          <Button
            aria-label={`Remove ${itemLabel} ${(index + 1).toString()}`}
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
          onChange([...items, '']);
        }}
      >
        <Plus size={16} />
        {addLabel}
      </Button>
    </div>
  );
}
