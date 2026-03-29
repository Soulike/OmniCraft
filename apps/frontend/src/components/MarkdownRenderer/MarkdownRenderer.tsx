import {memo} from 'react';
import type {Components} from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import {CodeBlock} from './components/CodeBlock/index.js';
import {isSafeUrl} from './helpers/isSafeUrl.js';
import styles from './styles.module.css';

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeHighlight];

const CUSTOM_COMPONENTS: Components = {
  pre({children}) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  a({href, children, node: _node, ...rest}) {
    if (!href || !isSafeUrl(href)) {
      return <span>{children}</span>;
    }
    const isExternal = href.startsWith('http');
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
  img({src, alt, node: _node, ...rest}) {
    if (!src || !isSafeUrl(src)) {
      return <span>{alt ?? ''}</span>;
    }
    return (
      <img
        src={src}
        alt={alt ?? ''}
        loading='lazy'
        referrerPolicy='no-referrer'
        {...rest}
      />
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
