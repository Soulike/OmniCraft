import {Input, Label, Radio, RadioGroup, TextField} from '@heroui/react';

import type {FormState} from '../../hooks/useFormState.js';
import type {Question} from '../../types.js';
import styles from './styles.module.css';

const OTHER_VALUE = '__other__';

interface QuestionItemProps {
  question: Question;
  index: number;
  formState: FormState;
  disabled: boolean;
}

export function QuestionItem({
  question,
  index,
  formState,
  disabled,
}: QuestionItemProps) {
  return (
    <div className={styles.questionBlock}>
      <span className={styles.questionText}>{question.question}</span>
      {question.options.length > 0 ? (
        <RadioGroup
          isDisabled={disabled}
          value={formState.selectedOptionByIndex.get(index) ?? ''}
          onChange={(value) => {
            if (value === OTHER_VALUE) {
              formState.switchToCustom(index);
            } else {
              formState.selectOption(index, value);
            }
          }}
        >
          {question.options.map((option) => (
            <Radio key={option} value={option}>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Radio.Content>
                <Label>{option}</Label>
              </Radio.Content>
            </Radio>
          ))}
          <Radio value={OTHER_VALUE}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>Other</Label>
            </Radio.Content>
          </Radio>
        </RadioGroup>
      ) : null}
      {(question.options.length === 0 ||
        formState.isCustomByIndex.get(index)) && (
        <TextField
          isDisabled={disabled}
          value={formState.customTextByIndex.get(index) ?? ''}
          onChange={(value) => {
            formState.setCustomText(index, value);
          }}
        >
          <Label className={styles.srOnly}>Your answer</Label>
          <Input placeholder='Type your answer...' />
        </TextField>
      )}
    </div>
  );
}
