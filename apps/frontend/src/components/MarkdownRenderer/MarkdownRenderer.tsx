import {memo} from 'react';
import type {Components} from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import {CodeBlock} from './components/CodeBlock/index.js';
import styles from './styles.module.css';

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeHighlight];

const SAFE_URL_PROTOCOLS = /^https?:|^mailto:|^tel:/i;

function isSafeUrl(href: string | undefined): boolean {
  if (!href) {
    return false;
  }
  // Relative URLs and fragment links are safe
  if (href.startsWith('/') || href.startsWith('#')) {
    return true;
  }
  return SAFE_URL_PROTOCOLS.test(href);
}

const CUSTOM_COMPONENTS: Components = {
  pre({children}) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  a({href, children, ...rest}) {
    if (!isSafeUrl(href)) {
      return <span {...rest}>{children}</span>;
    }
    const isExternal = href?.startsWith('http');
    return (
      <a
        href={href}
        {...(isExternal ? {target: '_blank', rel: 'noopener noreferrer'} : {})}
        {...rest}
      >
        {children}
      </a>
    );
  },
};

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={CUSTOM_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
