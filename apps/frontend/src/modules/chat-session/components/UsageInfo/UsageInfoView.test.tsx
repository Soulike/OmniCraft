import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UsageInfoView} from './UsageInfoView.js';

describe('UsageInfoView', () => {
  it('renders thinking level from usage metadata', () => {
    render(
      <UsageInfoView
        usage={{
          model: 'test-model',
          contextWindowTokens: 100,
          sessionInputTokens: 20,
          sessionOutputTokens: 5,
          sessionCacheReadInputTokens: 10,
          thinkingLevel: 'high',
        }}
      />,
    );

    expect(screen.getByText('Thinking: High')).toBeInTheDocument();
    expect(screen.getByText(/Input: 20 \/ 100/)).toBeInTheDocument();
  });
});
