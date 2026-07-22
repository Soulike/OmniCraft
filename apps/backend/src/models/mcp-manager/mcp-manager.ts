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
  /**
   * Per-server monotonic connect/teardown counter, independent of
   * `records`. `teardown()` deletes the record for a name, so a
   * generation kept on the record would reset to `undefined` and could
   * never distinguish a superseded in-flight `connect()` from the
   * current one. This map is never cleared, only ever bumped, so an
   * in-flight `connect()` (or its `onToolsChanged`/`refreshTools`
   * follow-up) can always tell whether it has been superseded by a
   * later `connect()` or `teardown()` for the same name.
   */
  private readonly generations = new Map<string, number>();

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
    // Names already acted on (torn down and/or reconnected) this pass.
    // `teardown()` deletes the record synchronously, so the "add newly
    // desired" loop below cannot rely on `!this.records.has(name)` alone
    // to tell a truly-new server from one just torn down/reconnected here
    // — that gap previously caused a duplicate connect on transport change.
    const handled = new Set<string>();

    // Remove servers no longer desired or disabled everywhere; reconnect
    // servers whose transport changed.
    for (const [name, record] of this.records) {
      const kinds = kindsByServer.get(name);
      const server = desired.get(name);
      handled.add(name);
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

    // Add newly desired+enabled servers not already handled above.
    for (const server of mcp.servers) {
      const kinds = kindsByServer.get(server.name);
      if (
        kinds &&
        kinds.size > 0 &&
        !this.records.has(server.name) &&
        !handled.has(server.name)
      ) {
        this.connect(server, kinds);
      }
    }
  }

  /** Synchronous read of the in-memory snapshot for a given agent kind. */
  getToolsForAgent(
    kind: AgentType,
  ): {server: string; tools: readonly McpToolInfo[]}[] {
    const out: {server: string; tools: readonly McpToolInfo[]}[] = [];
    for (const record of this.records.values()) {
      if (record.status === 'connected' && record.kinds.has(kind)) {
        // Defensive copy: callers must not be able to mutate the
        // manager's internal tool-list snapshot through the returned
        // reference.
        out.push({server: record.server.name, tools: [...record.tools]});
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

  /**
   * Forces a reconnect of the named server.
   * @returns `true` if the server exists (reconnect started), `false` if unknown.
   */
  async reconnect(name: string): Promise<boolean> {
    const record = this.records.get(name);
    if (!record) return false;
    const {server, kinds} = record;
    await this.teardown(name);
    this.connect(server, kinds);
    return true;
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
    const gen = this.bumpGeneration(server.name);
    const record: ServerRecord = {
      server,
      kinds,
      status: 'connecting',
      tools: [],
    };
    this.records.set(server.name, record);

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
    // Bump before deleting so any in-flight connect() for this name
    // (captured `gen` from before this teardown) is detected as stale
    // once it resolves, even though its record is gone by then.
    this.bumpGeneration(name);
    this.records.delete(name);
    await record.client?.close().catch(() => undefined);
  }

  /** Bumps and returns the new generation for `name`. Never resets. */
  private bumpGeneration(name: string): number {
    const next = (this.generations.get(name) ?? 0) + 1;
    this.generations.set(name, next);
    return next;
  }

  private isStale(name: string, gen: number): boolean {
    return this.generations.get(name) !== gen;
  }
}
