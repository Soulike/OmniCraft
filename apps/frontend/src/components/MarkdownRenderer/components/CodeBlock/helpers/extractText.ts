import {isValidElement,type ReactNode} from 'react';

function hasChildren(props: unknown): props is {children: ReactNode} {
  return typeof props === 'object' && props !== null && 'children' in props;
}

/**
 * Recursively extracts plain text from a React element tree.
 */
export function extractText(node: ReactNode): string {
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (!isValidElement(node)) {
    return '';
  }
  if (!hasChildren(node.props)) {
    return '';
  }
  return extractText(node.props.children);
}
