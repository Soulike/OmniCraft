import assert from 'node:assert';

import type {
  AgentType,
  McpServer,
  McpSettings,
} from '@omnicraft/settings-schema';

import {logger} from '@/logger.js';

import {createMcpClient} from './create-mcp-client.js';
import type {
  McpCallResult,
  McpClient,
  McpClientFactory,
  McpServerStatus,
  McpToolInfo,
  ServerStatus,
} from './types.js';

interface ServerRecord {
  server: McpServer;
  kinds: Set<AgentType>;
  status: ServerStatus;
  tools: McpToolInfo[];
  error?: string;
  client?: McpClient;
  /** Bumped on each (re)connect so stale async completions can be ignored. */
  generation: number;
}

/**
 * Owns MCP server connections, tool discovery, and tool invocation.
 *
 * `applyConfig` reconciles the desired configuration against live
 * connections in the background and returns promptly; connection failures
 * are recorded on the affected server's status and never thrown.
 *
 * Use {@link McpManager.create} to instantiate.
 */
export class McpManager {
  private static instance: McpManager | null = null;

  private readonly records = new Map<string, ServerRecord>();

  private constructor(private readonly createClient: McpClientFactory) {}

  /** Creates the singleton instance. */
  static create(createClient: McpClientFactory = createMcpClient): McpManager {
    assert(McpManager.instance === null, 'McpManager already created');
    McpManager.instance = new McpManager(createClient);
    return McpManager.instance;
  }

  /** Returns the singleton instance. */
  static getInstance(): McpManager {
    assert(McpManager.instance !== null, 'McpManager not created');
    return McpManager.instance;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static async resetInstanceForTesting(): Promise<void> {
    await McpManager.instance?.dispose();
    McpManager.instance = null;
  }

  /** Reconciles live connections to the desired config. Returns promptly. */
  applyConfig(mcp: McpSettings): void {
    const kindsByServer = this.computeKinds(mcp);
    const desired = new Map(mcp.servers.map((s) => [s.name, s]));

    // Remove servers no longer desired or disabled everywhere.
    for (const [name, record] of this.records) {
      const kinds = kindsByServer.get(name);
      const server = desired.get(name);
      if (!server || !kinds || kinds.size === 0) {
        void this.teardown(name);
        continue;
      }
      // Reconnect if the transport definition changed; else just update kinds.
      if (
        JSON.stringify(record.server.transport) !==
        JSON.stringify(server.transport)
      ) {
        void this.teardown(name).then(() => {
          this.connect(server, kinds);
        });
      } else {
        record.kinds = kinds;
      }
    }

    // Add newly desired+enabled servers.
    for (const server of mcp.servers) {
      const kinds = kindsByServer.get(server.name);
      if (kinds && kinds.size > 0 && !this.records.has(server.name)) {
        this.connect(server, kinds);
      }
    }
  }

  /** Synchronous read of the in-memory snapshot for a given agent kind. */
  getToolsForAgent(kind: AgentType): {server: string; tools: McpToolInfo[]}[] {
    const out: {server: string; tools: McpToolInfo[]}[] = [];
    for (const record of this.records.values()) {
      if (record.status === 'connected' && record.kinds.has(kind)) {
        out.push({server: record.server.name, tools: record.tools});
      }
    }
    return out;
  }

  async callTool(
    server: string,
    tool: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<McpCallResult> {
    const record = this.records.get(server);
    if (!record?.client || record.status !== 'connected') {
      return {text: `MCP server "${server}" is not connected`, isError: true};
    }
    return record.client.callTool(tool, args, signal);
  }

  list(): McpServerStatus[] {
    return [...this.records.values()].map((r) => ({
      name: r.server.name,
      transportType: r.server.transport.type,
      status: r.status,
      tools: r.tools.map((t) => ({name: t.name, description: t.description})),
      error: r.error,
    }));
  }

  async reconnect(name: string): Promise<void> {
    const record = this.records.get(name);
    if (!record) return;
    const {server, kinds} = record;
    await this.teardown(name);
    this.connect(server, kinds);
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.records.keys()].map((name) => this.teardown(name)),
    );
  }

  private computeKinds(mcp: McpSettings): Map<string, Set<AgentType>> {
    const map = new Map<string, Set<AgentType>>();
    for (const server of mcp.servers) map.set(server.name, new Set());
    for (const [kind, names] of Object.entries(mcp.enabledByAgent) as [
      AgentType,
      string[],
    ][]) {
      for (const name of names) map.get(name)?.add(kind);
    }
    return map;
  }

  private connect(server: McpServer, kinds: Set<AgentType>): void {
    const record: ServerRecord = {
      server,
      kinds,
      status: 'connecting',
      tools: [],
      generation: (this.records.get(server.name)?.generation ?? 0) + 1,
    };
    this.records.set(server.name, record);
    const gen = record.generation;

    void (async () => {
      try {
        const client = await this.createClient(server);
        if (this.isStale(server.name, gen)) {
          await client.close();
          return;
        }
        record.client = client;
        record.tools = await client.listTools();
        record.status = 'connected';
        client.onToolsChanged(() => {
          void this.refreshTools(server.name, gen);
        });
      } catch (e) {
        if (this.isStale(server.name, gen)) return;
        record.status = 'error';
        record.error = e instanceof Error ? e.message : String(e);
        logger.warn({e, server: server.name}, 'MCP server connection failed');
      }
    })();
  }

  private async refreshTools(name: string, gen: number): Promise<void> {
    const record = this.records.get(name);
    if (!record?.client || this.isStale(name, gen)) return;
    try {
      record.tools = await record.client.listTools();
    } catch (e) {
      logger.warn({e, server: name}, 'MCP tools/list refresh failed');
    }
  }

  private async teardown(name: string): Promise<void> {
    const record = this.records.get(name);
    if (!record) return;
    this.records.delete(name);
    await record.client?.close().catch(() => undefined);
  }

  private isStale(name: string, gen: number): boolean {
    return this.records.get(name)?.generation !== gen;
  }
}
