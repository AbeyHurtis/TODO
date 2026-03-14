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
        // --- 1. GET TASKS ---
        this.mcpServer.registerTool(
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
        this.mcpServer.registerTool(
            'todo_add_tasks',
            {
                description: 'Bulk adds new tasks to the tracker. Highly flexible: Use this tool to parse conversations, git commits, or unstructured requests and map them into multiple categorized tasks at once. If the user makes a vague request like "extract tasks from this transcript", deduce the categories, dates (YYYY-MM-DD), and titles, then pass them as an array here.',
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
        this.mcpServer.registerTool(
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
        this.mcpServer.registerTool(
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
