import assert from 'node:assert';

import type {LlmThinkingBlock} from '../types.js';

/** Accumulates thinking text and signature deltas for a single content block. */
export class ThinkingBlockAccumulator {
  private readonly blocks = new Map<
    number,
    {text: string; signature: string}
  >();

  start(index: number): void {
    this.blocks.set(index, {text: '', signature: ''});
  }

  has(index: number): boolean {
    return this.blocks.has(index);
  }

  appendText(index: number, delta: string): void {
    const block = this.blocks.get(index);
    assert(block, `No thinking block at index ${index.toString()}`);
    block.text += delta;
  }

  appendSignature(index: number, delta: string): void {
    const block = this.blocks.get(index);
    assert(block, `No thinking block at index ${index.toString()}`);
    block.signature += delta;
  }

  finish(index: number): LlmThinkingBlock {
    const block = this.blocks.get(index);
    assert(block, `No thinking block at index ${index.toString()}`);
    this.blocks.delete(index);
    return {content: [block.text], signature: block.signature};
  }
}
