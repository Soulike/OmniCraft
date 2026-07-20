import type {IncomingMessage, ServerResponse} from 'node:http';

import {describe, expect, it} from 'vitest';

import {requestLogLevel} from './request-logger.js';

const req = {} as IncomingMessage;

function res(statusCode: number): ServerResponse {
  return {statusCode} as ServerResponse;
}

describe('requestLogLevel', () => {
  it('silences successful responses (2xx)', () => {
    expect(requestLogLevel(req, res(200))).toBe('silent');
    expect(requestLogLevel(req, res(201))).toBe('silent');
  });

  it('silences redirects (3xx)', () => {
    expect(requestLogLevel(req, res(302))).toBe('silent');
    expect(requestLogLevel(req, res(304))).toBe('silent');
  });

  it('logs client errors (4xx) at warn', () => {
    expect(requestLogLevel(req, res(400))).toBe('warn');
    expect(requestLogLevel(req, res(404))).toBe('warn');
    expect(requestLogLevel(req, res(499))).toBe('warn');
  });

  it('logs server errors (5xx) at error', () => {
    expect(requestLogLevel(req, res(500))).toBe('error');
    expect(requestLogLevel(req, res(503))).toBe('error');
  });

  it('logs at error when the request threw, regardless of status', () => {
    expect(requestLogLevel(req, res(200), new Error('boom'))).toBe('error');
  });
});
