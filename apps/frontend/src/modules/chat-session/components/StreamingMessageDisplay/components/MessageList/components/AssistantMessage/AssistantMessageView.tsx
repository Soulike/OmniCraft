import type {FC, SVGProps} from 'react';

import OmnicraftDarkIcon from '@/assets/icons/omnicraft-dark.svg?react';
import OmnicraftLightIcon from '@/assets/icons/omnicraft-light.svg?react';
import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';
import type {ResolvedTheme} from '@/contexts/theme/index.js';

import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

const BRAND_ICONS: Record<ResolvedTheme, FC<SVGProps<SVGSVGElement>>> = {
  light: OmnicraftLightIcon,
  dark: OmnicraftDarkIcon,
};

interface AssistantMessageViewProps {
  content: string;
  theme: ResolvedTheme;
}

export function AssistantMessageView({
  content,
  theme,
}: AssistantMessageViewProps) {
  const BrandIcon = BRAND_ICONS[theme];

  return (
    <div className={styles.assistant}>
      <div className={styles.label}>
        <span className={styles.sigil} aria-hidden='true'>
          <BrandIcon className={styles.sigilIcon} />
        </span>
        <span className={styles.name}>OmniCraft</span>
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
