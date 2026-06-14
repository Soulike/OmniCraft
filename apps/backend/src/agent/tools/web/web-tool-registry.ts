import {ToolRegistry} from '@/agent-core/tool/index.js';

import {webFetchTool} from './web-fetch.js';
import {webFetchRawTool} from './web-fetch-raw.js';
import {webSearchTool} from './web-search.js';

/** Registry for web-related tools: fetching URLs, searching, etc. */
export class WebToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(webFetchTool);
    this.register(webFetchRawTool);
    this.register(webSearchTool);
  }
}

export const webToolRegistry = new WebToolRegistry();
