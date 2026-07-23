import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {ReadFileMediaResultView} from './ReadFileMediaResultView.js';

describe('ReadFileMediaResultView', () => {
  it('renders the file path, media type, size, and image icon', () => {
    const {container} = render(
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
    expect(container.querySelector('.lucide-file-image')).toBeInTheDocument();
  });

  it('renders the document icon for a PDF', () => {
    const {container} = render(
      <ReadFileMediaResultView
        byteSize={1024}
        filePath='r.pdf'
        kind='document'
        mediaType='application/pdf'
      />,
    );
    expect(screen.getByText('r.pdf')).toBeInTheDocument();
    expect(container.querySelector('.lucide-file-text')).toBeInTheDocument();
  });
});
