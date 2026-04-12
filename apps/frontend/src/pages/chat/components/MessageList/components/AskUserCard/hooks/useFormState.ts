import {useCallback, useState} from 'react';

import {OTHER_VALUE} from '../constants.js';
import type {AnswerEntry, Question} from '../types.js';

export interface FormState {
  /** Selected option value per question index. */
  selectedOptionByIndex: ReadonlyMap<number, string>;
  /** Custom text input value per question index. */
  customTextByIndex: ReadonlyMap<number, string>;
  /** Whether each question is using the custom "Other" option. */
  isCustomByIndex: ReadonlyMap<number, boolean>;
  /** Select or deselect an option for a question. */
  toggleOption: (questionIndex: number, option: string) => void;
  /** Switch to custom "Other" input for a question. */
  switchToCustom: (questionIndex: number) => void;
  /** Clear the "Other" selection for a question. */
  clearCustom: (questionIndex: number) => void;
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

  const toggleOption = useCallback((questionIndex: number, option: string) => {
    setSelectedOptionByIndex((prev) => {
      const current = prev.get(questionIndex);
      const next = new Map(prev);
      if (current === option) {
        next.delete(questionIndex);
      } else {
        next.set(questionIndex, option);
      }
      return next;
    });
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, false));
  }, []);

  const switchToCustom = useCallback((questionIndex: number) => {
    setSelectedOptionByIndex((prev) =>
      new Map(prev).set(questionIndex, OTHER_VALUE),
    );
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, true));
  }, []);

  const clearCustom = useCallback((questionIndex: number) => {
    setSelectedOptionByIndex((prev) => {
      const next = new Map(prev);
      next.delete(questionIndex);
      return next;
    });
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, false));
    setCustomTextByIndex((prev) => {
      const next = new Map(prev);
      next.delete(questionIndex);
      return next;
    });
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
    toggleOption,
    switchToCustom,
    clearCustom,
    setCustomText,
    collectAnswers,
  };
}
