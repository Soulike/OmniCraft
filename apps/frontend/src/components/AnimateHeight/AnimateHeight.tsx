import {type ReactNode, useLayoutEffect, useRef, useState} from 'react';

import styles from './styles.module.css';

interface AnimateHeightProps {
  children: ReactNode;
}

/**
 * Animates its own height whenever the measured height of its content changes,
 * so swapping or resizing the content grows/shrinks smoothly instead of
 * jumping. Honors `prefers-reduced-motion` via CSS.
 */
export function AnimateHeight({children}: AnimateHeightProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setHeight(content.getBoundingClientRect().height);
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className={styles.outer} style={{height}}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
