import {ToolSetDefinition} from '@/agent-core/tool-set/index.js';

import {webFetchTool} from './web-fetch.js';
import {webFetchRawTool} from './web-fetch-raw.js';

/** Tool set for web-related operations: fetching URLs, searching, etc. */
export class WebToolSet extends ToolSetDefinition {
  constructor() {
    super({
      name: 'web',
      description:
        'Tools for retrieving information from the web, including fetching URL contents and web search.',
    });
    this.register(webFetchTool);
    this.register(webFetchRawTool);
  }
}
