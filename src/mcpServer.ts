import * as vscode from 'vscode';
import * as http from 'http';
import { ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TodoViewProvider } from './TodoViewProvider';
import { randomUUID } from 'crypto';
import { z } from 'zod';

type SessionEntry = { server: McpServer; transport: StreamableHTTPServerTransport };

export class TodoMcpServer {
    private httpServer!: http.Server;
    private httpPort: number = 0;
    /** Session ID -> { server, transport } so multiple Cursor clients can connect without "Server already initialized". */
    private sessions = new Map<string, SessionEntry>();

    constructor(private provider: TodoViewProvider) { }

    /** Creates a response wrapper that captures mcp-session-id and stores the session for future requests. */
    private captureSessionIdRes(res: ServerResponse, entry: SessionEntry): ServerResponse {
        const origSetHeader = res.setHeader.bind(res);
        const origWriteHead = res.writeHead.bind(res);
        res.setHeader = (name: string | string[], value: string | number | string[]): ServerResponse => {
            if (typeof name === 'string' && name.toLowerCase() === 'mcp-session-id') {
                const id = Array.isArray(value) ? value[0] : value;
                if (typeof id === 'string') this.sessions.set(id, entry);
            }
            return (origSetHeader as (n: string | string[], v: string | number | string[]) => ServerResponse)(name, value);
        };
        res.writeHead = (statusCode: number, ...args: unknown[]): ServerResponse => {
            const headers = args.find((a): a is Record<string, string | string[] | number | undefined> =>
                typeof a === 'object' && a !== null && !Array.isArray(a)) as Record<string, string | string[] | number | undefined> | undefined;
            const sid = headers?.['mcp-session-id'];
            if (typeof sid === 'string') this.sessions.set(sid, entry);
            else if (Array.isArray(sid) && sid[0]) this.sessions.set(String(sid[0]), entry);
            return origWriteHead(statusCode, ...(args as [string?, Record<string, string | string[] | number | undefined>?]));
        };
        return res;
    }

    /** Creates a new MCP server + transport pair for one client session. */
    private createSession(): SessionEntry {
        const server = new McpServer({
            name: 'TODO_Extension',
            version: '0.0.1',
        });
        this.registerToolsOn(server);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });
        server.connect(transport);
        return { server, transport };
    }

    public async start(): Promise<vscode.Uri> {
        this.httpServer = http.createServer(async (req, res) => {
            if (req.url !== "/mcp") {
                res.writeHead(404).end();
                return;
            }

            try {
                const sessionId = req.headers['mcp-session-id'];
                const existing = typeof sessionId === 'string' ? this.sessions.get(sessionId) : undefined;

                if (existing) {
                    await existing.transport.handleRequest(req, res);
                    return;
                }

                // New client: create a dedicated server+transport so each connection gets its own init (avoids "Server already initialized").
                const entry = this.createSession();
                this.captureSessionIdRes(res, entry);
                await entry.transport.handleRequest(req, res);
            } catch (err) {
                console.error('[TODO MCP] Request error:', err);
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
        for (const { server } of this.sessions.values()) {
            await server?.close();
        }
        this.sessions.clear();
        this.httpServer?.close();
    }

    // ── Tool Registration (per-session server) ───────────────────────────
    private registerToolsOn(mcpServer: McpServer) {
        // --- 1. GET TASKS ---
        mcpServer.registerTool(
            'todo_get_tasks',
            {
                description: 'Retrieves all tasks currently in the TODO extension. ALWAYS use this first when the user asks to "get", "view", or "show" tasks (e.g., "get me the current blocked items", "get the active items to work for today", "get all overdue items"). ALSO use this first if the user says "start working on..." so you can find the task IDs before updating them. The response includes colored indicators: 🔵 TODO, 🟠 Active, 🟣 Backlog, 🔴 Blocked, 🟢 Completed.',
                inputSchema: z.object({}),
            },
            async () => {
                const tasks = this.provider.getTasks();
                let output = "# Current TODO List\n\n";
                
                if (tasks.length === 0) {
                    output += "*No tasks found. The tracker is empty.*";
                } else {
                    const categories: { [key: string]: typeof tasks } = {
                        'TODO': [], 'Active': [], 'Backlog': [], 'Blocked': [], 'Completed': []
                    };
                    
                    tasks.forEach((t: any) => {
                        const cat = t.category || (t.completed ? 'Completed' : 'Active');
                        if (categories[cat]) categories[cat].push(t);
                        else categories['Active'].push(t); // fallback
                    });

                    const catVisuals: {[key: string]: string} = {
                        'TODO': '🔵 TODO',
                        'Active': '🟠 Active',
                        'Backlog': '🟣 Backlog',
                        'Blocked': '🔴 Blocked',
                        'Completed': '🟢 Completed'
                    };

                    for (const [catName, catTasks] of Object.entries(categories)) {
                        if (catTasks.length > 0) {
                            output += `## ${catVisuals[catName]}\n`;
                            catTasks.forEach((t: any) => {
                                const due = t.dueDate ? ` (Due: ${t.dueDate})` : '';
                                output += `- \`${t.id}\`: ${t.title}${due}\n`;
                            });
                            output += '\n';
                        }
                    }
                }

                return {
                    content: [{ type: "text", text: output }],
                    isError: false
                };
            }
        );

        // --- 2. ADD TASKS (BULK) ---
        mcpServer.registerTool(
            'todo_add_tasks',
            { 
                description: 'In registerToolsOn(), for todo_get_tasks: Get the user\'s todo list from the TODO extension. Use this when the user asks "what is in my todo list", "show my tasks", "get my todos", or to view/show/get tasks. ALWAYS use this first before todo_update_tasks or todo_delete_tasks so you have the correct task IDs. Response includes: 🔵 TODO, 🟠 Active, 🟣 Backlog, 🔴 Blocked, 🟢 Completed.',
                inputSchema: z.object({
                    tasks: z.array(z.object({
                        title: z.string().describe("Clear, concise task title"),
                        category: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed"]).optional().describe("Deduced category. Defaults to TODO."),
                        dueDate: z.string().optional().describe("Optional date in YYYY-MM-DD format if mentioned in context.")
                    })).describe("List of tasks to create")
                }),
            },
            async (args) => {
                const { tasks } = args;
                if (!tasks || tasks.length === 0) {
                     return { content: [{ type: "text", text: "No tasks provided to add." }], isError: true };
                }

                await this.provider.addTasks(tasks);

                return {
                    content: [{ type: "text", text: `Success: Bulk added ${tasks.length} task(s).` }],
                    isError: false
                };
            }
        );

        // --- 3. UPDATE TASKS (BULK) ---
        mcpServer.registerTool(
            'todo_update_tasks',
            {
                description: 'Bulk updates existing tasks. Use this for moving tasks between categories (e.g., "start working on X" means move X to Active, "mark as done" means move to Completed) or changing due dates. Triggers: "start working on...", "work on...", "mark as...". You MUST use todo_get_tasks first to know the correct `id` of the tasks you want to modify.',
                inputSchema: z.object({
                    updates: z.array(z.object({
                        id: z.string().describe("The exact task ID from todo_get_tasks"),
                        title: z.string().optional().describe("New title. Leave undefined to keep existing."),
                        category: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed"]).optional().describe("New category to move the task into."),
                        dueDate: z.string().optional().describe("New due date (YYYY-MM-DD) or null to remove.") // null is handled by omitting or explicit string, handled downstream
                    })).describe("List of partial updates for existing tasks")
                }),
            },
            async (args) => {
                const { updates } = args;
                if (!updates || updates.length === 0) {
                     return { content: [{ type: "text", text: "No updates provided." }], isError: true };
                }

                await this.provider.updateTasks(updates);

                return {
                    content: [{ type: "text", text: `Success: Processed updates for ${updates.length} task(s).` }],
                    isError: false
                };
            }
        );

        // --- 4. DELETE TASKS (BULK) ---
        mcpServer.registerTool(
            'todo_delete_tasks',
            {
                description: 'Bulk deletes tasks by exact ID. ALWAYS run todo_get_tasks first to get the correct IDs before deleting.',
                inputSchema: z.object({
                    ids: z.array(z.string()).describe("List of exact task IDs to permanently delete.")
                }),
            },
            async (args) => {
                const { ids } = args;
                if (!ids || ids.length === 0) {
                     return { content: [{ type: "text", text: "No IDs provided to delete." }], isError: true };
                }

                await this.provider.deleteTasks(ids);

                return {
                    content: [{ type: "text", text: `Success: Deleted ${ids.length} task(s).` }],
                    isError: false
                };
            }
        );
    }
}
