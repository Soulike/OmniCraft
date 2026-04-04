import {ToolRegistry} from '@/agent-core/tool/index.js';

import {webFetchTool} from './web-fetch.js';
import {webFetchRawTool} from './web-fetch-raw.js';
import {webSearchTool} from './web-search.js';

/** Registry for web-related tools: fetching URLs, searching, etc. */
export class WebToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all web tools. */
  static override create(): WebToolRegistry {
    const instance = super.create() as WebToolRegistry;
    instance.register(webFetchTool);
    instance.register(webFetchRawTool);
    instance.register(webSearchTool);
    return instance;
  }
}
