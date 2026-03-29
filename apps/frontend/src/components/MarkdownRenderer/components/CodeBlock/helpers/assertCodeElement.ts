import {isValidElement,type ReactElement, type ReactNode} from 'react';

export interface CodeProps {
  className?: string;
  children?: ReactNode;
}

export function assertCodeElement(
  node: ReactNode,
): asserts node is ReactElement<CodeProps> {
  if (!isValidElement(node)) {
    throw new Error('CodeBlock expects a <code> element as its child');
  }
}
