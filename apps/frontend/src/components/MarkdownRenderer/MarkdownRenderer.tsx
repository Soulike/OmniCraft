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
  // Fragment links are safe
  if (href.startsWith('#')) {
    return true;
  }
  // Relative URLs (but not protocol-relative //example.com)
  if (href.startsWith('/') && !href.startsWith('//')) {
    return true;
  }
  return SAFE_URL_PROTOCOLS.test(href);
}

const CUSTOM_COMPONENTS: Components = {
  pre({children}) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a({href, children, node, ...rest}) {
    if (!isSafeUrl(href)) {
      return <span>{children}</span>;
    }
    const isExternal =
      href?.startsWith('http') === true || href?.startsWith('//') === true;
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
