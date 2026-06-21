import {render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UsageInfoView} from './UsageInfoView.js';

describe('UsageInfoView', () => {
  it('renders thinking level from usage metadata', () => {
    render(
      <UsageInfoView
        usage={{
          model: 'test-model',
          contextWindowTokens: 100,
          currentContextInputTokens: 20,
          sessionInputTokens: 20,
          sessionOutputTokens: 5,
          sessionCacheReadInputTokens: 10,
          thinkingLevel: 'high',
        }}
      />,
    );

    expect(screen.getByText('Thinking: High')).toBeInTheDocument();
    expect(screen.getByText(/Context: 20 \/ 100/)).toBeInTheDocument();
    expect(screen.getByText('Input: 20')).toBeInTheDocument();
  });

  it('renders current context input separately from session input', () => {
    const {container} = render(
      <UsageInfoView
        usage={{
          model: 'test-model',
          contextWindowTokens: 100,
          currentContextInputTokens: 20,
          sessionInputTokens: 150,
          sessionOutputTokens: 5,
          sessionCacheReadInputTokens: 10,
          thinkingLevel: 'high',
        }}
      />,
    );

    expect(
      within(container).getByText(/Context: 20 \/ 100/),
    ).toBeInTheDocument();
    expect(within(container).getByText('Input: 150')).toBeInTheDocument();
  });
});
