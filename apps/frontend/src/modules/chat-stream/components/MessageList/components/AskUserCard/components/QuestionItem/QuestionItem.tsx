import {Checkbox, Input, Label, TextField} from '@heroui/react';

import type {FormState} from '../../hooks/useFormState.js';
import type {Question} from '../../types.js';
import styles from './styles.module.css';

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
  const selected = formState.selectedOptionByIndex.get(index);
  const isCustom = formState.isCustomByIndex.get(index) ?? false;

  return (
    <div className={styles.questionBlock}>
      <div className={styles.questionHeader}>
        <span className={styles.questionNumber}>{index + 1}.</span>
        <span className={styles.questionText}>{question.question}</span>
      </div>
      {question.options.length > 0 ? (
        <div className={styles.optionList}>
          {question.options.map((option) => (
            <Checkbox
              key={option}
              variant='secondary'
              isDisabled={disabled}
              isSelected={selected === option && !isCustom}
              onChange={() => {
                formState.toggleOption(index, option);
              }}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Label>{option}</Label>
              </Checkbox.Content>
            </Checkbox>
          ))}
          <Checkbox
            variant='secondary'
            isDisabled={disabled}
            isSelected={isCustom}
            onChange={(checked) => {
              if (checked) {
                formState.switchToCustom(index);
              } else {
                formState.clearCustom(index);
              }
            }}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label>Other</Label>
            </Checkbox.Content>
          </Checkbox>
        </div>
      ) : null}
      {(question.options.length === 0 || isCustom) && (
        <TextField
          variant='secondary'
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
