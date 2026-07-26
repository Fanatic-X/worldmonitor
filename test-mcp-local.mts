import { mcpHandler } from './api/mcp.ts';

async function run() {
  console.log("Starte Phase 1 PoC: Rufe den internen WorldMonitor MCP Handler auf...\n");

  // 1. Initialize simulieren
  const reqInit = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: "test-init-id",
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} }
    })
  });

  // Minimale Mock Dependencies für den Handler
  const mockDeps = {
    resolveBearerToContext: async () => null,
    validateProMcpToken: async () => null,
    getEntitlements: async () => null,
    validateUserApiKey: async () => null,
    guardUserApiKeyValidation: async () => null,
    redisPipeline: async () => []
  };

  const resInit = await mcpHandler(reqInit, mockDeps as any);
  const dataInit = await resInit.json();
  console.log("Erfolgreich initialisiert!");
  console.log("Server Info:", dataInit.result.serverInfo);

  // 2. Tools simulieren
  const reqList = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: "test-list-id",
      method: 'tools/list'
    })
  });

  const resList = await mcpHandler(reqList, mockDeps as any);
  const dataList = await resList.json();
  const tools = dataList.result.tools;

  console.log(`\nGefunden: ${tools.length} Tools in der MCP-Registry!\n`);
  for (const tool of tools.slice(0, 5)) {
    console.log(`- ${tool.name}: ${tool.description.substring(0, 80)}...`);
  }
}

run().catch(console.error);
