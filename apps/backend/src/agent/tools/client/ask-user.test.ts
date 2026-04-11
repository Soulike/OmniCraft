import assert from 'node:assert';

import {describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {askUserTool} from './ask-user.js';

describe('askUserTool', () => {
  it('has the correct name and description', () => {
    expect(askUserTool.name).toBe('ask_user');
    expect(askUserTool.description).toBeTruthy();
  });

  it('returns success with answers when user submits', async () => {
    const context = createMockContext({callId: 'test-call-1'});

    const executePromise = askUserTool.execute(
      {
        questions: [
          {question: 'What city?', options: ['NYC', 'SF']},
          {question: 'Your name?', options: []},
        ],
      },
      context,
    );

    // Simulate frontend submitting a response
    context.userInteractionBridge.submitResponse('test-call-1', {
      cancelled: false,
      answers: [
        {question: 'What city?', answer: 'SF'},
        {question: 'Your name?', answer: 'Alice'},
      ],
    });

    const result = await executePromise;

    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(result.data.answers).toEqual([
      {question: 'What city?', answer: 'SF'},
      {question: 'Your name?', answer: 'Alice'},
    ]);
    expect(result.content).toContain('What city?');
    expect(result.content).toContain('SF');
  });

  it('returns failure when user cancels', async () => {
    const context = createMockContext({callId: 'test-call-2'});

    const executePromise = askUserTool.execute(
      {questions: [{question: 'Favorite color?', options: ['Red', 'Blue']}]},
      context,
    );

    context.userInteractionBridge.submitResponse('test-call-2', {
      cancelled: true,
    });

    const result = await executePromise;

    expect(result.status).toBe('failure');
    assert(result.status === 'failure');
    expect(result.data.message).toContain('declined');
  });

  it('handles unanswered questions (null answer)', async () => {
    const context = createMockContext({callId: 'test-call-3'});

    const executePromise = askUserTool.execute(
      {
        questions: [
          {question: 'Q1?', options: ['A']},
          {question: 'Q2?', options: []},
        ],
      },
      context,
    );

    context.userInteractionBridge.submitResponse('test-call-3', {
      cancelled: false,
      answers: [
        {question: 'Q1?', answer: 'A'},
        {question: 'Q2?', answer: null},
      ],
    });

    const result = await executePromise;

    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(result.data.answers[1].answer).toBeNull();
  });
});
