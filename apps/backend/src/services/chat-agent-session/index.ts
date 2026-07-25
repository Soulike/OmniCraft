import {MainAgentStore} from '@/models/agent-store/index.js';
import {createAgentAttachmentService} from '@/services/agent-attachments/index.js';

export {chatAgentSessionService} from './chat-agent-session-service.js';

export const chatAgentAttachments = createAgentAttachmentService(() =>
  MainAgentStore.getInstance(),
);
