import {Skeleton} from '@heroui/react';
import type {FC, SVGProps} from 'react';

import OmnicraftDarkIcon from '@/assets/icons/omnicraft-dark.svg?react';
import OmnicraftLightIcon from '@/assets/icons/omnicraft-light.svg?react';
import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';
import type {ResolvedTheme} from '@/contexts/theme/index.js';

import type {ChatMessage} from '../../../../types.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

const BRAND_ICONS: Record<ResolvedTheme, FC<SVGProps<SVGSVGElement>>> = {
  light: OmnicraftLightIcon,
  dark: OmnicraftDarkIcon,
};

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
  theme: ResolvedTheme;
}

export function MessageBubbleView({
  role,
  content,
  theme,
}: MessageBubbleViewProps) {
  if (role === 'user') {
    return (
      <div className={styles.userBubble}>
        <div className={styles.content}>
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <Skeleton className={styles.skeleton} />
          )}
        </div>
      </div>
    );
  }

  const BrandIcon = BRAND_ICONS[theme];

  return (
    <div className={styles.assistant}>
      <div className={styles.assistantLabel}>
        <span className={styles.sigil} aria-hidden='true'>
          <BrandIcon className={styles.sigilIcon} />
        </span>
        <span className={styles.assistantName}>OmniCraft</span>
      </div>
      <div className={styles.content}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <WorkingIndicator />
        )}
      </div>
    </div>
  );
}
