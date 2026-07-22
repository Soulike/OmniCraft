import assert from 'node:assert';

import {
  type CallToolResult,
  CallToolResultSchema,
  type Tool,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import type {
  AgentType,
  McpServer,
  McpSettings,
} from '@omnicraft/settings-schema';

import {AsyncQueue} from '@/helpers/async-queue.js';
import {logger} from '@/logger.js';

import {createMcpClient} from './create-mcp-client.js';
import type {McpClient, McpClientFactory} from './types.js';

/** Fields present on an MCP server connection in any state. */
interface ServerConnectionBase {
  server: McpServer;
  enabledAgentTypes: Set<AgentType>;
}

/**
 * A configured MCP server together with its live connection state, modeled as
 * a discriminated union on `status` so a `connected` connection always carries
 * its `client` and `tools` and an `error` connection always carries its
 * message — the fields can no longer be present in the wrong state. A
 * `disabled` server is represented by absence from the connection map rather
 * than a status value.
 */
type ServerConnection =
  | (ServerConnectionBase & {status: 'connecting'})
  | (ServerConnectionBase & {
      status: 'connected';
      client: McpClient;
      tools: Tool[];
    })
  | (ServerConnectionBase & {status: 'error'; error: string});

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
   * in-flight `connect()` (or its tools-changed/refresh follow-up) can always
   * tell whether it has been superseded by a later `connect()` or
   * `teardown()` for the same name.
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
  static resetInstanceForTesting(): void {
    McpManager.instance?.dispose();
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
    // Snapshot entries: the transport-change branch below tears down and
    // reconnects synchronously (deleting then re-adding the same key), which
    // would otherwise make the live Map iterator revisit that key this pass.
    for (const [serverName, connection] of [...this.serverNameToConnections]) {
      const enabledAgentTypes = serverNameToEnabledAgentTypes.get(serverName);
      const desiredConfig = serverNameToDesiredConfigs.get(serverName);
      handledServerNames.add(serverName);
      if (
        !desiredConfig ||
        !enabledAgentTypes ||
        enabledAgentTypes.size === 0
      ) {
        this.teardown(serverName);
        continue;
      }
      // Reconnect if the transport definition changed; otherwise just update
      // which agent types the (still-connected) server is enabled for.
      if (
        JSON.stringify(connection.server.transport) !==
        JSON.stringify(desiredConfig.transport)
      ) {
        // Tear down and reconnect synchronously so the fresh `connecting`
        // entry is visible to any later applyConfig in this same tick. A
        // deferred reconnect (`teardown().then(connect)`) would let a later
        // applyConfig that removes this server slip through — it would not see
        // the already-deleted record — and the deferred connect would then
        // resurrect the removed server with stale config. The old client
        // closes in the background; the generation guard fences its in-flight
        // connect.
        this.teardown(serverName);
        this.connect(desiredConfig, enabledAgentTypes);
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
  ): {serverName: string; tools: readonly Tool[]}[] {
    const result: {serverName: string; tools: readonly Tool[]}[] = [];
    for (const connection of this.serverNameToConnections.values()) {
      if (
        connection.status === 'connected' &&
        connection.enabledAgentTypes.has(agentType)
      ) {
        // Defensive copy: callers must not mutate the internal snapshot.
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
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    const connection = this.serverNameToConnections.get(serverName);
    if (connection?.status !== 'connected') {
      return {
        content: [
          {type: 'text', text: `MCP server "${serverName}" is not connected`},
        ],
        isError: true,
      };
    }
    // Pin CallToolResultSchema so the SDK validates the response to the modern
    // CallToolResult at runtime; its static return type still widens to the
    // legacy {toolResult} compat union, which the pin rules out — so assert to
    // the modern shape.
    return connection.client.callTool(
      {name: toolName, arguments: args ?? {}},
      CallToolResultSchema,
      {signal},
    ) as Promise<CallToolResult>;
  }

  list(): McpServerStatusResponse[] {
    return [...this.serverNameToConnections.values()].map((connection) => ({
      name: connection.server.name,
      transportType: connection.server.transport.type,
      status: connection.status,
      tools:
        connection.status === 'connected'
          ? connection.tools.map((tool) => ({
              name: tool.name,
              description: tool.description ?? '',
            }))
          : [],
      error: connection.status === 'error' ? connection.error : undefined,
    }));
  }

  /**
   * Forces a reconnect of the named server.
   * @returns `true` if the server exists (reconnect started), `false` if unknown.
   */
  reconnect(serverName: string): boolean {
    const connection = this.serverNameToConnections.get(serverName);
    if (!connection) return false;
    const {server, enabledAgentTypes} = connection;
    this.teardown(serverName);
    this.connect(server, enabledAgentTypes);
    return true;
  }

  dispose(): void {
    for (const serverName of [...this.serverNameToConnections.keys()]) {
      this.teardown(serverName);
    }
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
    };
    this.serverNameToConnections.set(server.name, connection);

    void (async () => {
      // The client stays local until the atomic `connected` publish below, so
      // no `connecting` connection ever holds a client the union forbids. The
      // `finally` closes the client whenever we still own it — a stale
      // supersede, a discovery/handler rejection, or an error publish — so no
      // failed connect leaks a transport. Ownership transfers to the
      // connection at publish, where `client` is cleared so `finally` becomes a
      // no-op and never closes a live connection.
      let client: McpClient | undefined;
      try {
        client = await this.createClient(server);
        if (this.isStale(server.name, generation)) return;
        const tools = await this.listAllTools(client);
        if (this.isStale(server.name, generation)) return;
        // Serialize this connection's tools/list refreshes so a slow earlier
        // refresh cannot overwrite a newer snapshot when notifications race.
        const refreshQueue = new AsyncQueue();
        client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
          void refreshQueue.enqueue(() =>
            this.refreshTools(server.name, generation),
          );
        });
        // Reflect a transport that dies after startup (child exit / stream
        // drop) by moving the connection to `error` rather than advertising a
        // dead server. Generation-gated so our own close() during
        // teardown/supersede — which bumps the generation first — is ignored.
        client.onclose = () => {
          this.handleClientClose(server.name, generation);
        };
        // Read `connection.enabledAgentTypes` rather than the captured value:
        // applyConfig mutates that field on this same object, so an
        // enable/disable applied while connecting is reflected here.
        this.serverNameToConnections.set(server.name, {
          server,
          enabledAgentTypes: connection.enabledAgentTypes,
          status: 'connected',
          client,
          tools,
        });
        client = undefined; // ownership transferred to the connection
      } catch (e) {
        if (this.isStale(server.name, generation)) return;
        this.serverNameToConnections.set(server.name, {
          server,
          enabledAgentTypes: connection.enabledAgentTypes,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
        logger.warn({e, server: server.name}, 'MCP server connection failed');
      } finally {
        await client?.close().catch(() => undefined);
      }
    })();
  }

  private async refreshTools(
    serverName: string,
    generation: number,
  ): Promise<void> {
    const connection = this.serverNameToConnections.get(serverName);
    if (
      connection?.status !== 'connected' ||
      this.isStale(serverName, generation)
    )
      return;
    try {
      connection.tools = await this.listAllTools(connection.client);
    } catch (e) {
      logger.warn({e, server: serverName}, 'MCP tools/list refresh failed');
    }
  }

  /**
   * Handles a connected client's transport closing on its own (child process
   * exit, HTTP stream drop). Generation-gated so a close triggered by our own
   * teardown/supersede — which bumps the generation first — is ignored. A live
   * close replaces the connection with an `error` state (dropping its client
   * and tools) so the snapshot, agents, and status endpoint stop advertising a
   * server that is no longer reachable.
   */
  private handleClientClose(serverName: string, generation: number): void {
    if (this.isStale(serverName, generation)) return;
    const connection = this.serverNameToConnections.get(serverName);
    if (connection?.status !== 'connected') return;
    this.serverNameToConnections.set(serverName, {
      server: connection.server,
      enabledAgentTypes: connection.enabledAgentTypes,
      status: 'error',
      error: 'MCP server transport closed',
    });
  }

  /**
   * Reads every page of a server's tool list. `listTools` is paginated via an
   * opaque cursor; a server with more tools than one page would otherwise be
   * silently truncated. Guards against a non-advancing cursor to avoid looping
   * forever on a misbehaving server.
   */
  private async listAllTools(client: McpClient): Promise<Tool[]> {
    const tools: Tool[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listTools(
        cursor === undefined ? undefined : {cursor},
      );
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor === undefined || seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
    }
    return tools;
  }

  private teardown(serverName: string): void {
    const connection = this.serverNameToConnections.get(serverName);
    if (!connection) return;
    // Bump before deleting so any in-flight connect() for this name
    // (captured `generation` from before this teardown) is detected as stale
    // once it resolves, even though its connection is gone by then.
    this.bumpGeneration(serverName);
    this.serverNameToConnections.delete(serverName);
    // Closing the client is fire-and-forget: the state that matters (the bump
    // and delete above) is already applied synchronously, so nothing needs to
    // wait for the socket/process to finish tearing down. Only a `connected`
    // connection owns a client here; a `connecting` one keeps its client local
    // until it publishes and closes it itself when superseded.
    if (connection.status === 'connected') {
      void connection.client.close().catch(() => undefined);
    }
  }

  /** Bumps and returns the new generation for `serverName`. Never resets. */
  private bumpGeneration(serverName: string): number {
    const next = (this.serverNameToGenerations.get(serverName) ?? 0) + 1;
    this.serverNameToGenerations.set(serverName, next);
    return next;
  }

  private isStale(serverName: string, generation: number): boolean {
    return this.serverNameToGenerations.get(serverName) !== generation;
  }
}
