import assert from 'node:assert';

import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {
  AgentType,
  McpServer,
  McpSettings,
} from '@omnicraft/settings-schema';

import {logger} from '@/logger.js';

import {createMcpClient} from './create-mcp-client.js';
import type {
  McpClient,
  McpClientFactory,
  McpServerStatus,
  McpToolInfo,
  ServerStatus,
} from './types.js';

/** A configured MCP server together with its live connection state. */
interface ServerConnection {
  server: McpServer;
  enabledAgentTypes: Set<AgentType>;
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

  private readonly serverNameToConnections = new Map<
    string,
    ServerConnection
  >();
  /**
   * Per-server monotonic connect/teardown counter, independent of
   * `serverNameToConnections`. `teardown()` deletes the connection for a
   * name, so a generation kept on the connection would reset to `undefined`
   * and could never distinguish a superseded in-flight `connect()` from the
   * current one. This map is never cleared, only ever bumped, so an
   * in-flight `connect()` (or its `onToolsChanged`/`refreshTools`
   * follow-up) can always tell whether it has been superseded by a
   * later `connect()` or `teardown()` for the same name.
   */
  private readonly serverNameToGenerations = new Map<string, number>();

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
    const serverNameToEnabledAgentTypes =
      this.computeEnabledAgentTypesByServerName(mcp);
    const serverNameToDesiredConfigs = new Map(
      mcp.servers.map((server) => [server.name, server]),
    );
    // Names already acted on (torn down and/or reconnected) this pass.
    // `teardown()` deletes the connection synchronously, so the "add newly
    // desired" loop below cannot rely on `!this.serverNameToConnections.has()`
    // alone to tell a truly-new server from one just torn down/reconnected
    // here — that gap previously caused a duplicate connect on transport
    // change.
    const handledServerNames = new Set<string>();

    // Remove servers no longer desired or disabled everywhere; reconnect
    // servers whose transport changed.
    for (const [serverName, connection] of this.serverNameToConnections) {
      const enabledAgentTypes = serverNameToEnabledAgentTypes.get(serverName);
      const desiredConfig = serverNameToDesiredConfigs.get(serverName);
      handledServerNames.add(serverName);
      if (
        !desiredConfig ||
        !enabledAgentTypes ||
        enabledAgentTypes.size === 0
      ) {
        void this.teardown(serverName);
        continue;
      }
      // Reconnect if the transport definition changed; otherwise just update
      // which agent types the (still-connected) server is enabled for.
      if (
        JSON.stringify(connection.server.transport) !==
        JSON.stringify(desiredConfig.transport)
      ) {
        void this.teardown(serverName).then(() => {
          this.connect(desiredConfig, enabledAgentTypes);
        });
      } else {
        connection.enabledAgentTypes = enabledAgentTypes;
      }
    }

    // Add newly desired+enabled servers not already handled above.
    for (const server of mcp.servers) {
      const enabledAgentTypes = serverNameToEnabledAgentTypes.get(server.name);
      if (
        enabledAgentTypes &&
        enabledAgentTypes.size > 0 &&
        !this.serverNameToConnections.has(server.name) &&
        !handledServerNames.has(server.name)
      ) {
        this.connect(server, enabledAgentTypes);
      }
    }
  }

  /** Synchronous read of the in-memory snapshot for a given agent type. */
  getToolsForAgent(
    agentType: AgentType,
  ): {serverName: string; tools: readonly McpToolInfo[]}[] {
    const result: {serverName: string; tools: readonly McpToolInfo[]}[] = [];
    for (const connection of this.serverNameToConnections.values()) {
      if (
        connection.status === 'connected' &&
        connection.enabledAgentTypes.has(agentType)
      ) {
        // Defensive copy: callers must not be able to mutate the
        // manager's internal tool-list snapshot through the returned
        // reference.
        result.push({
          serverName: connection.server.name,
          tools: [...connection.tools],
        });
      }
    }
    return result;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    const connection = this.serverNameToConnections.get(serverName);
    if (!connection?.client || connection.status !== 'connected') {
      return {
        content: [
          {type: 'text', text: `MCP server "${serverName}" is not connected`},
        ],
        isError: true,
      };
    }
    return connection.client.callTool(toolName, args, signal);
  }

  list(): McpServerStatus[] {
    return [...this.serverNameToConnections.values()].map((connection) => ({
      name: connection.server.name,
      transportType: connection.server.transport.type,
      status: connection.status,
      tools: connection.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
      error: connection.error,
    }));
  }

  /**
   * Forces a reconnect of the named server.
   * @returns `true` if the server exists (reconnect started), `false` if unknown.
   */
  async reconnect(serverName: string): Promise<boolean> {
    const connection = this.serverNameToConnections.get(serverName);
    if (!connection) return false;
    const {server, enabledAgentTypes} = connection;
    await this.teardown(serverName);
    this.connect(server, enabledAgentTypes);
    return true;
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.serverNameToConnections.keys()].map((serverName) =>
        this.teardown(serverName),
      ),
    );
  }

  private computeEnabledAgentTypesByServerName(
    mcp: McpSettings,
  ): Map<string, Set<AgentType>> {
    const serverNameToEnabledAgentTypes = new Map<string, Set<AgentType>>();
    for (const server of mcp.servers) {
      serverNameToEnabledAgentTypes.set(server.name, new Set());
    }
    for (const [agentType, serverNames] of Object.entries(
      mcp.enabledByAgent,
    ) as [AgentType, string[]][]) {
      for (const serverName of serverNames) {
        serverNameToEnabledAgentTypes.get(serverName)?.add(agentType);
      }
    }
    return serverNameToEnabledAgentTypes;
  }

  private connect(server: McpServer, enabledAgentTypes: Set<AgentType>): void {
    const generation = this.bumpGeneration(server.name);
    const connection: ServerConnection = {
      server,
      enabledAgentTypes,
      status: 'connecting',
      tools: [],
    };
    this.serverNameToConnections.set(server.name, connection);

    void (async () => {
      try {
        const client = await this.createClient(server);
        if (this.isStale(server.name, generation)) {
          await client.close();
          return;
        }
        connection.client = client;
        connection.tools = await client.listTools();
        connection.status = 'connected';
        client.onToolsChanged(() => {
          void this.refreshTools(server.name, generation);
        });
      } catch (e) {
        if (this.isStale(server.name, generation)) return;
        connection.status = 'error';
        connection.error = e instanceof Error ? e.message : String(e);
        logger.warn({e, server: server.name}, 'MCP server connection failed');
      }
    })();
  }

  private async refreshTools(
    serverName: string,
    generation: number,
  ): Promise<void> {
    const connection = this.serverNameToConnections.get(serverName);
    if (!connection?.client || this.isStale(serverName, generation)) return;
    try {
      connection.tools = await connection.client.listTools();
    } catch (e) {
      logger.warn({e, server: serverName}, 'MCP tools/list refresh failed');
    }
  }

  private async teardown(serverName: string): Promise<void> {
    const connection = this.serverNameToConnections.get(serverName);
    if (!connection) return;
    // Bump before deleting so any in-flight connect() for this name
    // (captured `generation` from before this teardown) is detected as stale
    // once it resolves, even though its connection is gone by then.
    this.bumpGeneration(serverName);
    this.serverNameToConnections.delete(serverName);
    await connection.client?.close().catch(() => undefined);
  }

  /** Bumps and returns the new generation for `serverName`. Never resets. */
  private bumpGeneration(serverName: string): number {
    const nextGeneration =
      (this.serverNameToGenerations.get(serverName) ?? 0) + 1;
    this.serverNameToGenerations.set(serverName, nextGeneration);
    return nextGeneration;
  }

  private isStale(serverName: string, generation: number): boolean {
    return this.serverNameToGenerations.get(serverName) !== generation;
  }
}
