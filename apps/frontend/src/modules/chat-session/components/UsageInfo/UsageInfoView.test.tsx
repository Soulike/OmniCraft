import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UsageInfoView} from './UsageInfoView.js';

describe('UsageInfoView', () => {
  it('renders thinking level from usage metadata', () => {
    render(
      <UsageInfoView
        usage={{
          model: 'test-model',
          maxInputTokens: 100,
          inputTokens: 20,
          outputTokens: 5,
          cacheReadInputTokens: 10,
          thinkingLevel: 'high',
        }}
      />,
    );

    expect(screen.getByText('Thinking: High')).toBeInTheDocument();
  });
});
