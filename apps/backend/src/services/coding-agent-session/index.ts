import {CodingAgentStore} from '@/models/agent-store/index.js';
import {createAgentAttachmentService} from '@/services/agent-attachments/index.js';

export {codingAgentSessionService} from './coding-agent-session-service.js';
export {MAX_MESSAGE_ATTACHMENT_BYTES} from '@/agent-core/llm-session/index.js';

export const codingAgentAttachments = createAgentAttachmentService(() =>
  CodingAgentStore.getInstance(),
);
