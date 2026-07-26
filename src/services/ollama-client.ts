import { premiumFetch } from '@/services/premium-fetch';
import { proxyUrl } from '@/utils/proxy';
import { getRuntimeConfigSnapshot } from '@/services/runtime-config';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown>;
    }
  }>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private toolsCache: McpTool[] | null = null;

  constructor() {
    const config = getRuntimeConfigSnapshot();
    this.baseUrl = config.secrets['OLLAMA_API_URL']?.value || 'http://localhost:11434';
    this.model = config.secrets['OLLAMA_MODEL']?.value || 'qwen2.5:7b';
  }

  async fetchMcpTools(): Promise<McpTool[]> {
    if (this.toolsCache) return this.toolsCache;

    const res = await premiumFetch(proxyUrl('/api/mcp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/list'
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch MCP tools: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'MCP Error');

    this.toolsCache = data.result.tools;
    return this.toolsCache!;
  }

  async callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await premiumFetch(proxyUrl('/api/mcp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to call tool ${name}: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'MCP Error');

    if (Array.isArray(data.result?.content)) {
      const textParts = data.result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);
      return textParts.join('\n');
    }

    return JSON.stringify(data.result?.content || data.result);
  }

  async *chatStream(
    messages: OllamaMessage[],
    onStateChange: (state: string) => void
  ): AsyncGenerator<string, void, unknown> {
    const tools = await this.fetchMcpTools();
    
    // Convert MCP tools to OpenAI/Ollama function calling schema
    const ollamaTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }
    }));

    let currentMessages = [...messages];
    
    while (true) {
      onStateChange('LLM überlegt...');
      const reqBody = {
        model: this.model,
        messages: currentMessages,
        tools: ollamaTools,
        stream: false // For simplicity, we don't stream the tool call itself
      };

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });

      if (!res.ok) throw new Error(`Ollama Error: ${res.status}`);
      const data = await res.json();
      const message = data.message;
      currentMessages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
          const fnName = call.function.name;
          const fnArgs = call.function.arguments;
          onStateChange(`Führt Tool aus: ${fnName}...`);
          
          try {
            const toolResult = await this.callMcpTool(fnName, fnArgs);
            currentMessages.push({
              role: 'tool',
              content: toolResult,
            });
          } catch (e) {
            currentMessages.push({
              role: 'tool',
              content: `Error calling tool ${fnName}: ${e instanceof Error ? e.message : String(e)}`,
            });
          }
        }
        // Loop continues to send tool results back to LLM
      } else {
        // Final response
        onStateChange('Antwort wird generiert...');
        // We can yield the final content. (If we wanted to stream the final response, we could set stream:true on the last call, but since we don't know when it's the last call, we just return the full text for now. To do true streaming, we'd need to peek if tool_calls is empty, but Ollama might not stream tool calls well.)
        yield message.content;
        break;
      }
    }
  }
}
