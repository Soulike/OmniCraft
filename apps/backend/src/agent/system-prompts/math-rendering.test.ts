import {describe, expect, it} from 'vitest';

import {mathRenderingInstructions} from './math-rendering.js';

describe('mathRenderingInstructions', () => {
  it('instructs the model to use markdown math delimiters rendered by chat', () => {
    expect(mathRenderingInstructions).toContain('$...$');
    expect(mathRenderingInstructions).toContain('$$...$$');
    expect(mathRenderingInstructions).toContain('\\(...\\)');
    expect(mathRenderingInstructions).toContain('\\[...\\]');
  });

  it('instructs the model to escape literal dollar signs', () => {
    expect(mathRenderingInstructions).toContain('\\$');
  });
});
