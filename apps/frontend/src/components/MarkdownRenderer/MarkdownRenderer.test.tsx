import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {MarkdownRenderer} from './MarkdownRenderer.js';
import styles from './styles.module.css';

describe('MarkdownRenderer', () => {
  it('renders inline LaTeX math with KaTeX markup', () => {
    const {container} = render(
      <MarkdownRenderer content={'Area is $A = \\pi r^2$.'} />,
    );

    expect(container.querySelector('.katex')).toBeInTheDocument();
  });

  it('renders display LaTeX math with KaTeX display markup', () => {
    const {container} = render(
      <MarkdownRenderer
        content={`$$
a^2 + b^2 = c^2
$$`}
      />,
    );

    expect(container.querySelector('.katex-display')).toBeInTheDocument();
  });

  it('renders fenced math blocks as display LaTeX math', () => {
    const {container} = render(
      <MarkdownRenderer
        content={`\`\`\`math
\\int_0^1 x^2 \\, dx
\`\`\``}
      />,
    );

    expect(container.querySelector('.katex-display')).toBeInTheDocument();
    expect(container.querySelector('pre')).not.toBeInTheDocument();
    expect(
      container.querySelector('code.language-math'),
    ).not.toBeInTheDocument();
  });

  it('renders unsupported LaTeX commands through KaTeX fallback markup', () => {
    const {container} = render(
      <MarkdownRenderer content={'Unsupported command $\\notacommand{}$.'} />,
    );

    expect(container.querySelector('.katex')).toBeInTheDocument();
  });

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
