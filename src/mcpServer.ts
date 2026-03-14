import * as vscode from 'vscode';
import * as http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TodoViewProvider } from './TodoViewProvider';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export class TodoMcpServer {
    private mcpServer!: McpServer;
    private httpServer!: http.Server;
    private transport!: StreamableHTTPServerTransport;
    private httpPort: number = 0;

    constructor(private provider: TodoViewProvider) { }

    public async start(): Promise<vscode.Uri> {
        // ── 1. Create the high-level McpServer ──────────────────────────
        this.mcpServer = new McpServer({
            name: 'TODO_Extension',
            version: '0.0.1',
        });

        // ── 2. Register tools with the new `registerTool` API ───────────
        this.registerTools();

        // ── 3. Create the Streamable HTTP transport (replaces deprecated SSE) ─
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        // ── 4. Connect the server to the transport ──────────────────────
        await this.mcpServer.connect(this.transport);

        // ── 5. Start a raw Node HTTP server that delegates to transport ─
        this.httpServer = http.createServer(async (req, res) => {

            if (req.url !== "/mcp") {
                res.writeHead(404).end();
                return;
            }

            try {
                await this.transport.handleRequest(req, res);
            } catch {
                res.writeHead(500).end("Internal Server Error");
            }
        });

        return new Promise((resolve) => {
            this.httpServer.listen(0, '127.0.0.1', () => {
                const addr = this.httpServer.address();
                if (addr && typeof addr === 'object') {
                    this.httpPort = addr.port;
                    console.log(`[TODO MCP] Server listening on http://127.0.0.1:${this.httpPort}`);
                    resolve(vscode.Uri.parse(`http://127.0.0.1:${this.httpPort}/mcp`));
                }
            });
        });
    }

    public async stop(): Promise<void> {
        await this.mcpServer?.close();
        this.httpServer?.close();
    }

    // ── Tool Registration ───────────────────────────────────────────────
    private registerTools() {
        this.mcpServer.registerTool(
            'todo_add',
            {
                description: 'Creates a new task. Specify a title and an optional category.',
                inputSchema: z.object({
                    title: z.string().describe("Short task title"),
                    category: z
                        .enum(["TODO", "Active", "Backlog", "Blocked", "Completed"])
                        .default("TODO")
                        .describe("Task category")
                }),
            },
            async (args) => {

                const { title, category } = args;

                const taskCategory = category || 'TODO';
                this.provider.addTask(title, null, taskCategory);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Success: Added "${title}" to ${taskCategory}`
                        }
                    ],
                    isError: false
                };
            }
        );
    }
}
