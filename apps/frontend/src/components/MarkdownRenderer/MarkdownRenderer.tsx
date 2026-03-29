import {memo} from 'react';
import type {Components} from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import {CodeBlock} from './components/CodeBlock/index.js';
import {sanitizeImageUrl, sanitizeLinkUrl} from './helpers/sanitize-url.js';
import styles from './styles.module.css';

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeHighlight];

const CUSTOM_COMPONENTS: Components = {
  pre({children}) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  a({href, children, node: _node, ...rest}) {
    const sanitizedHref = sanitizeLinkUrl(href ?? '');
    if (!sanitizedHref) {
      return <span>{children}</span>;
    }
    const isExternal = sanitizedHref.startsWith('http');
    return (
      <a
        href={sanitizedHref}
        {...(isExternal ? {target: '_blank', rel: 'noopener noreferrer'} : {})}
        {...rest}
      >
        {children}
      </a>
    );
  },
  img({src, alt, node: _node, ...rest}) {
    const sanitizedSrc = sanitizeImageUrl(src ?? '');
    if (!sanitizedSrc) {
      return <span>{alt ?? ''}</span>;
    }
    return (
      <img
        src={sanitizedSrc}
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
