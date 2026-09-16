import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import { ITodoStore, TaskItem, registerTodoTools } from './todoTools';

/**
 * File-backed TodoStore that directly reads and writes `.todo` in the workspace directory.
 * Ideal for on-demand Stdio MCP execution without needing a running VS Code instance or open TCP port.
 */
export class FileTodoStore implements ITodoStore {
    private filePath: string;

    constructor(workspaceDir: string = process.cwd()) {
        this.filePath = path.join(workspaceDir, '.todo');
    }

    private readTasksFromFile(): TaskItem[] {
        if (!fs.existsSync(this.filePath)) {
            return [];
        }
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            const data = JSON.parse(raw);
            return Array.isArray(data.tasks) ? data.tasks : [];
        } catch (e) {
            console.error(`[TODO Stdio] Failed to read ${this.filePath}:`, e);
            return [];
        }
    }

    private writeTasksToFile(tasks: TaskItem[]): void {
        try {
            let data: any = {};
            if (fs.existsSync(this.filePath)) {
                try {
                    const raw = fs.readFileSync(this.filePath, 'utf8');
                    data = JSON.parse(raw);
                } catch {
                    data = {};
                }
            }
            data.tasks = tasks;
            const outputData: any = {
                "$instruction": "⚠️ DO NOT EDIT DIRECTLY. Use the TODO MCP tools (todo_get_tasks, todo_add_tasks, todo_update_tasks, todo_delete_tasks, todo_clear_category) to ensure live VS Code UI synchronization.",
                ...data
            };
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(outputData, null, 2), 'utf8');
        } catch (e) {
            console.error(`[TODO Stdio] Failed to write ${this.filePath}:`, e);
        }
    }

    private sortTasks(tasks: TaskItem[]): TaskItem[] {
        return tasks.sort((a, b) => {
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            if (dateA !== dateB) return dateA - dateB;
            return 0;
        });
    }

    public getTasks(): TaskItem[] {
        return this.readTasksFromFile();
    }

    public async addTasks(newTasksData: { title: string; dueDate?: string | null; category?: string; id?: string }[]): Promise<void> {
        const tasks = this.readTasksFromFile();
        for (const data of newTasksData) {
            const safeId = data.id
                ? data.id.replace(/[^a-zA-Z0-9_-]/g, '')
                : Date.now().toString() + Math.random().toString(36).substring(7);

            tasks.push({
                id: safeId || Date.now().toString(),
                title: data.title,
                category: data.category || 'TODO',
                dueDate: data.dueDate || null,
                completed: data.category === 'Completed'
            });
        }

        const sorted = this.sortTasks(tasks);
        this.writeTasksToFile(sorted);
    }

    public async updateTasks(updates: { id: string; title?: string; category?: string; dueDate?: string | null }[]): Promise<void> {
        const tasks = this.readTasksFromFile();
        let changed = false;

        for (const update of updates) {
            const task = tasks.find(t => t.id === update.id);
            if (task) {
                if (update.title !== undefined) task.title = update.title;
                if (update.category !== undefined) {
                    task.category = update.category;
                    task.completed = (update.category === 'Completed');
                }
                if (update.dueDate !== undefined) task.dueDate = update.dueDate;
                changed = true;
            }
        }

        if (changed) {
            const sorted = this.sortTasks(tasks);
            this.writeTasksToFile(sorted);
        }
    }

    public async deleteTasks(ids: string[]): Promise<void> {
        let tasks = this.readTasksFromFile();
        const initialLen = tasks.length;
        tasks = tasks.filter(t => !ids.includes(t.id));

        if (tasks.length !== initialLen) {
            this.writeTasksToFile(tasks);
        }
    }

    public async clearCategory(category: string): Promise<number> {
        let tasks = this.readTasksFromFile();
        const initialLen = tasks.length;
        if (category === 'ALL') {
            tasks = [];
        } else {
            tasks = tasks.filter(t => {
                const taskCat = t.category || (t.completed ? 'Completed' : 'Active');
                return taskCat !== category;
            });
        }
        const deletedCount = initialLen - tasks.length;
        this.writeTasksToFile(tasks);
        return deletedCount;
    }

    public async moveCategory(fromCategory: string, toCategory: string): Promise<number> {
        let tasks = this.readTasksFromFile();
        let movedCount = 0;
        tasks.forEach(t => {
            const taskCat = t.category || (t.completed ? 'Completed' : 'Active');
            if (taskCat === fromCategory) {
                t.category = toCategory;
                t.completed = (toCategory === 'Completed');
                movedCount++;
            }
        });
        if (movedCount > 0) {
            this.writeTasksToFile(tasks);
        }
        return movedCount;
    }
}

let stdioServerStarted = false;

export async function runStdioServer() {
    if (stdioServerStarted) return;
    stdioServerStarted = true;

    let workspaceDir = process.env.TODO_WORKSPACE || process.cwd();

    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
            workspaceDir = args[i + 1];
            i++;
        }
    }

    const store = new FileTodoStore(workspaceDir);
    const server = new McpServer({
        name: 'TODO_Extension_Stdio',
        version: '2.0.0'
    });

    registerTodoTools(server, store);

    const transport = new StdioServerTransport();
    console.error(`[TODO Stdio] Starting MCP server for workspace: ${workspaceDir}`);
    await server.connect(transport);
    console.error(`[TODO Stdio] MCP Server connected on Stdio successfully.`);
}

// Auto-run when executed as standalone bundle
runStdioServer().catch((err) => {
    console.error('[TODO Stdio] Fatal server error:', err);
    process.exit(1);
});
