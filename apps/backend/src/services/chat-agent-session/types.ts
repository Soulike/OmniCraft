import type {LlmAttachment} from '@omnicraft/tool-schemas';

import type {
  AttachmentDescriptor,
  SaveAttachmentFailureReason,
} from '@/agent-core/agent/index.js';

/** Reasons why chat session creation can fail. */
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
}

/** Result of createSession: either success with sessionId, or failure with error. */
export type CreateSessionResult =
  | {success: true; sessionId: string}
  | {success: false; error: CreateSessionError};

/**
 * Result of `sendCompletion`. The three failure reasons map 1:1 onto the
 * router's status codes: `session-not-found` → 404, `unknown-attachments` →
 * 400 (with the missing names), `attachments-too-large` → 413 (with the
 * totals) — see `chat-agent-session-service.ts` for where each is produced.
 */
export type SendCompletionResult =
  | {readonly ok: true}
  | {readonly ok: false; readonly reason: 'session-not-found'}
  | {
      readonly ok: false;
      readonly reason: 'unknown-attachments';
      readonly missing: string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'attachments-too-large';
      readonly totalBytes: number;
      readonly limit: number;
    };

/**
 * Result of `saveAttachment`. Folds "session not found" into the same failure
 * channel as the attachment store's own save failures, so a caller has one
 * place to switch instead of two.
 */
export type AttachmentUploadResult =
  | {readonly ok: true; readonly attachment: LlmAttachment}
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | SaveAttachmentFailureReason;
    };

/**
 * Result of `describeAttachment`. `session-not-found` and
 * `attachment-not-found` are distinct outcomes — the session may or may not
 * exist independently of whether the named file does.
 */
export type AttachmentDescribeResult =
  | {readonly ok: true; readonly descriptor: AttachmentDescriptor}
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'attachment-not-found';
    };

/** Result of `removeAttachment`. */
export type AttachmentRemoveResult =
  | {readonly ok: true}
  | {
      readonly ok: false;
      readonly reason:
        | 'session-not-found'
        | 'attachment-not-found'
        | 'attachment-frozen';
    };
