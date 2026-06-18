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

  describe('does not render raw HTML (XSS)', () => {
    it('escapes a raw <script> tag instead of executing it', () => {
      const {container} = render(
        <MarkdownRenderer
          content={'Hello <script>window.__xss = true;</script> world'}
        />,
      );

      expect(container.querySelector('script')).not.toBeInTheDocument();
      expect(container.textContent).toContain('<script>');
    });

    it('does not create an element from a raw <img onerror> payload', () => {
      const {container} = render(
        <MarkdownRenderer content={'<img src=x onerror="window.__xss=1">'} />,
      );

      // Raw HTML is escaped, so no real <img> element is produced.
      expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    it('drops a javascript: link URL', () => {
      const {container} = render(
        <MarkdownRenderer content={'[click me](javascript:alert(1))'} />,
      );

      const anchor = container.querySelector('a');
      expect(anchor).not.toBeInTheDocument();
      expect(container.textContent).toContain('click me');
    });

    it('drops a javascript: image URL', () => {
      const {container} = render(
        <MarkdownRenderer content={'![alt](javascript:alert(1))'} />,
      );

      expect(container.querySelector('img')).not.toBeInTheDocument();
    });
  });
});
