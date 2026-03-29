import {describe, expect, it} from 'vitest';

import {parseFrontmatter} from './parse-frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter and body', () => {
    const input = `---
name: code-review
description: Guide for reviewing code
---

# Code Review

Follow these steps...`;

    const result = parseFrontmatter<{name: string; description: string}>(input);
    expect(result.attributes).toEqual({
      name: 'code-review',
      description: 'Guide for reviewing code',
    });
    expect(result.body).toBe('\n# Code Review\n\nFollow these steps...');
  });

  it('returns empty attributes and full body when no frontmatter is present', () => {
    const input = '# Just a heading\n\nSome content.';
    const result = parseFrontmatter(input);
    expect(result.attributes).toEqual({});
    expect(result.body).toBe(input);
  });

  it('returns empty attributes when file starts with --- but has no closing ---', () => {
    const input = '---\nname: test\nSome content without closing delimiter.';
    const result = parseFrontmatter(input);
    expect(result.attributes).toEqual({});
    expect(result.body).toBe(input);
  });

  it('handles empty frontmatter block', () => {
    const input = '---\n---\n\nBody content.';
    const result = parseFrontmatter(input);
    expect(result.attributes).toEqual({});
    expect(result.body).toBe('\nBody content.');
  });

  it('handles empty body', () => {
    const input = '---\nname: test\n---';
    const result = parseFrontmatter<{name: string}>(input);
    expect(result.attributes).toEqual({name: 'test'});
    expect(result.body).toBe('');
  });

  it('handles frontmatter with various YAML types', () => {
    const input = `---
title: My Post
count: 42
enabled: true
tags:
  - a
  - b
---
Body`;

    const result = parseFrontmatter<{
      title: string;
      count: number;
      enabled: boolean;
      tags: string[];
    }>(input);

    expect(result.attributes).toEqual({
      title: 'My Post',
      count: 42,
      enabled: true,
      tags: ['a', 'b'],
    });
    expect(result.body).toBe('Body');
  });

  it('does not treat ---foo on a line as a closing delimiter', () => {
    // The closing delimiter must be `---` on its own line, not `---foo`.
    // Here `---` at end is the real closing delimiter.
    const input = '---\nname: test\n---\n---foo is body content';
    const result = parseFrontmatter<{name: string}>(input);
    expect(result.attributes).toEqual({name: 'test'});
    // The first valid `---` on its own line closes frontmatter.
    // `---foo is body content` is the body.
    expect(result.body).toBe('---foo is body content');
  });
});
