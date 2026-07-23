import type {McpTransport} from '@omnicraft/settings-schema';

/** One-line human summary of a transport for the server card. */
export function formatTransportSummary(transport: McpTransport): string {
  if (transport.type === 'stdio') {
    const command = [transport.command, ...transport.args].join(' ');
    return `stdio · ${command}`;
  }
  return `http · ${transport.url}`;
}
