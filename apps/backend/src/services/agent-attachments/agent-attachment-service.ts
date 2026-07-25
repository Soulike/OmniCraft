import type {Readable} from 'node:stream';

import type {LlmAttachment} from '@omnicraft/tool-schemas';

import type {
  OpenedAttachment,
  SaveAttachmentResult,
} from '@/agent-core/agent/index.js';
import type {AgentStore} from '@/models/agent-store/index.js';

export type ResolveAttachmentsResult =
  | {readonly ok: true; readonly attachments: LlmAttachment[]}
  | {readonly ok: false; readonly missing: string[]};

export interface AgentAttachmentService {
  save(
    agentId: string,
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult | null>;
  describe(agentId: string, fileName: string): Promise<OpenedAttachment | null>;
  remove(agentId: string, fileName: string): Promise<boolean | null>;
  resolve(
    agentId: string,
    fileNames: readonly string[],
  ): Promise<ResolveAttachmentsResult | null>;
}

/**
 * Binds attachment operations to one session family. The operations themselves
 * live on `Agent`; the only thing that differs between chat and coding sessions
 * is which store resolves the id — and that lookup is the access boundary, so
 * the two bindings must stay separate. `getStore` is a thunk because
 * `getInstance()` asserts the singleton exists and must run per request, not at
 * module load.
 *
 * Every method returns `null` when the session does not exist, which the router
 * maps to 404.
 */
export function createAgentAttachmentService(
  getStore: () => AgentStore,
): AgentAttachmentService {
  return {
    async save(agentId, desiredName, body) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.saveAttachment(desiredName, body);
    },

    async describe(agentId, fileName) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.describeAttachment(fileName);
    },

    async remove(agentId, fileName) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.removeAttachment(fileName);
    },

    async resolve(agentId, fileNames) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.resolveAttachments(fileNames);
    },
  };
}
