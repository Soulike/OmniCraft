import {ContextCompactionBlockView} from './ContextCompactionBlockView.js';
import {useContextCompactionBlock} from './hooks/useContextCompactionBlock.js';

interface ContextCompactionBlockInProgressProps {
  status: 'in-progress';
}
interface ContextCompactionBlockDoneProps {
  status: 'done';
  beforeTokens: number;
  afterTokens: number;
  summary: string;
}
interface ContextCompactionBlockFailedProps {
  status: 'failed';
  errorMessage: string;
}

type ContextCompactionBlockProps =
  | ContextCompactionBlockInProgressProps
  | ContextCompactionBlockDoneProps
  | ContextCompactionBlockFailedProps;

export function ContextCompactionBlock(props: ContextCompactionBlockProps) {
  const {isExpanded, onExpandedChange} = useContextCompactionBlock({
    status: props.status,
  });

  if (props.status === 'in-progress') {
    return (
      <ContextCompactionBlockView
        status='in-progress'
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
      />
    );
  }
  if (props.status === 'done') {
    return (
      <ContextCompactionBlockView
        status='done'
        beforeTokens={props.beforeTokens}
        afterTokens={props.afterTokens}
        summary={props.summary}
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
      />
    );
  }
  return (
    <ContextCompactionBlockView
      status='failed'
      errorMessage={props.errorMessage}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    />
  );
}
