import {describe, expect, it} from 'vitest';

import {adjectives, createNickname, nouns} from './nickname.js';

describe('createNickname', () => {
  it('produces an adjective-noun handle', () => {
    const nickname = createNickname(new Set());
    expect(nickname).toMatch(/^[a-z]+-[a-z]+$/);
    const [adjective, noun] = nickname.split('-');
    expect(adjectives).toContain(adjective);
    expect(nouns).toContain(noun);
  });

  it('never returns a value already in the taken set', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const nickname = createNickname(taken);
      expect(taken.has(nickname)).toBe(false);
      taken.add(nickname);
    }
  });

  it('ships enough words to make collisions rare', () => {
    expect(adjectives.length).toBeGreaterThanOrEqual(50);
    expect(nouns.length).toBeGreaterThanOrEqual(50);
  });
});
