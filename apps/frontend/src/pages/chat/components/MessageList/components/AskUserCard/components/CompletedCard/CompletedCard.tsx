import {CircleCheck} from 'lucide-react';

import type {AnswerEntry} from '../../types.js';
import styles from './styles.module.css';

interface CompletedCardProps {
  answers: AnswerEntry[];
}

export function CompletedCard({answers}: CompletedCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <CircleCheck size={16} className={styles.statusIcon} />
        <span className={styles.headerTitle}>Questions Answered</span>
      </div>
      <div className={styles.body}>
        {answers.map(({question, answer}) => (
          <div key={question} className={styles.answerBlock}>
            <span className={styles.question}>{question}</span>
            <span className={styles.answer}>{answer ?? '(no answer)'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
