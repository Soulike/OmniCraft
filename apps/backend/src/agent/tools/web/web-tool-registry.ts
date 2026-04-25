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

  override getSystemPromptSection(): string {
    return [
      '## Web Tools',
      '',
      'Use web tools when the task depends on current, external, or source-specific information that is not reliably available from the repository or conversation.',
      '',
      'Guidance:',
      '- Search when you need to discover sources or compare current information across sources.',
      '- Fetch when you already have a specific URL or need the full content behind a search result.',
      '- Prefer authoritative sources such as official documentation, primary repositories, standards, release notes, and vendor pages.',
      '- Use raw fetching only when readable extraction hides details that matter, such as raw HTML, JSON, or machine-readable files.',
      '- When web information affects the answer, make clear what source or version the conclusion is based on.',
    ].join('\n');
  }
}
