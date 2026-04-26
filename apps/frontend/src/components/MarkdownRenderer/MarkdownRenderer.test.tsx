import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {MarkdownRenderer} from './MarkdownRenderer.js';
import styles from './styles.module.css';

describe('MarkdownRenderer', () => {
  it('wraps GFM tables in a horizontal scroll container', () => {
    render(
      <MarkdownRenderer
        content={`| First | Second |
| --- | --- |
| Alpha | Beta |`}
      />,
    );

    const table = screen.getByRole('table');

    expect(table.parentElement).toHaveClass(styles.tableScroll);
  });
});
