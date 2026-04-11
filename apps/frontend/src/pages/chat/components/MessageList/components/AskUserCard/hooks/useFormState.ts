import {useCallback, useState} from 'react';

import type {AnswerEntry, Question} from '../types.js';

const OTHER_VALUE = '__other__';

export interface FormState {
  /** Selected option value per question index. */
  selectedOptionByIndex: ReadonlyMap<number, string>;
  /** Custom text input value per question index. */
  customTextByIndex: ReadonlyMap<number, string>;
  /** Whether each question is using the custom "Other" option. */
  isCustomByIndex: ReadonlyMap<number, boolean>;
  /** Select a predefined option for a question. */
  selectOption: (questionIndex: number, option: string) => void;
  /** Switch to custom "Other" input for a question. */
  switchToCustom: (questionIndex: number) => void;
  /** Update custom text for a question. */
  setCustomText: (questionIndex: number, text: string) => void;
  /** Collect current form state into an AnswerEntry array. */
  collectAnswers: () => AnswerEntry[];
}

/** Manages the form selection state for the questionnaire. */
export function useFormState(questions: Question[]): FormState {
  const [selectedOptionByIndex, setSelectedOptionByIndex] = useState<
    Map<number, string>
  >(() => new Map());
  const [customTextByIndex, setCustomTextByIndex] = useState<
    Map<number, string>
  >(() => new Map());
  const [isCustomByIndex, setIsCustomByIndex] = useState<Map<number, boolean>>(
    () => new Map(),
  );

  const selectOption = useCallback((questionIndex: number, option: string) => {
    setSelectedOptionByIndex((prev) =>
      new Map(prev).set(questionIndex, option),
    );
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, false));
  }, []);

  const switchToCustom = useCallback((questionIndex: number) => {
    setSelectedOptionByIndex((prev) =>
      new Map(prev).set(questionIndex, OTHER_VALUE),
    );
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, true));
  }, []);

  const setCustomText = useCallback((questionIndex: number, text: string) => {
    setCustomTextByIndex((prev) => new Map(prev).set(questionIndex, text));
  }, []);

  const collectAnswers = useCallback((): AnswerEntry[] => {
    return questions.map((q, i) => {
      if (isCustomByIndex.get(i)) {
        const text = customTextByIndex.get(i)?.trim();
        return {question: q.question, answer: text?.length ? text : null};
      }
      const selected = selectedOptionByIndex.get(i);
      if (selected && selected !== OTHER_VALUE) {
        return {question: q.question, answer: selected};
      }
      return {question: q.question, answer: null};
    });
  }, [questions, selectedOptionByIndex, customTextByIndex, isCustomByIndex]);

  return {
    selectedOptionByIndex,
    customTextByIndex,
    isCustomByIndex,
    selectOption,
    switchToCustom,
    setCustomText,
    collectAnswers,
  };
}
