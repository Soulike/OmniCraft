import {CodingAgentStore} from '@/models/agent-store/index.js';
import {createAgentAttachmentService} from '@/services/agent-attachments/index.js';

export {codingAgentSessionService} from './coding-agent-session-service.js';

export const codingAgentAttachments = createAgentAttachmentService(() =>
  CodingAgentStore.getInstance(),
);
