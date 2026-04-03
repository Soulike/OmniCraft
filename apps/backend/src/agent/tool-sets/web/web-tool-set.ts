import {ToolSetDefinition} from '@/agent-core/tool-set/index.js';

/** Tool set for web-related operations: fetching URLs, searching, etc. */
export class WebToolSet extends ToolSetDefinition {
  constructor() {
    super({
      name: 'web',
      description:
        'Tools for retrieving information from the web, including fetching URL contents and web search.',
    });
  }
}
