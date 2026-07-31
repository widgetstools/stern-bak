import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { templatesDir } from './lib/paths.js';
import { PLATFORM_RESOURCES, PLATFORM_TOOLS, dispatchPlatformTool } from './tools/registry.js';

export function createStaruiMcpServer(): Server {
  const server = new Server(
    { name: 'starui-platform', version: '0.3.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: PLATFORM_TOOLS }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: PLATFORM_RESOURCES.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const resource = PLATFORM_RESOURCES.find((r) => r.uri === req.params.uri);
    if (!resource) throw new Error(`Unknown resource: ${req.params.uri}`);
    const text = readFileSync(join(templatesDir(), 'resources', resource.file), 'utf8');
    return { contents: [{ uri: req.params.uri, mimeType: resource.mimeType, text }] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const result = await dispatchPlatformTool(req.params.name, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}
