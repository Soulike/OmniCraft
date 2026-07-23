import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {ReadFileMediaResultView} from './ReadFileMediaResultView.js';

describe('ReadFileMediaResultView', () => {
  it('renders the file path, media type, and size', () => {
    render(
      <ReadFileMediaResultView
        byteSize={245760}
        filePath='pixel.png'
        kind='image'
        mediaType='image/png'
      />,
    );
    expect(screen.getByText('pixel.png')).toBeInTheDocument();
    expect(screen.getByText(/image\/png/)).toBeInTheDocument();
    expect(screen.getByText(/240 KB/)).toBeInTheDocument();
  });
});
