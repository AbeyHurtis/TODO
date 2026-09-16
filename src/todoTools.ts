import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { McpLogger } from './logger';

export interface TaskItem {
    id: string;
    title: string;
    category?: 'TODO' | 'Active' | 'Backlog' | 'Blocked' | 'Completed' | string;
    dueDate?: string | null;
    completed?: boolean;
}

export interface ITodoStore {
    getTasks(): TaskItem[];
    addTasks(tasks: { title: string; dueDate?: string | null; category?: string; id?: string }[]): Promise<void>;
    updateTasks(updates: { id: string; title?: string; category?: string; dueDate?: string | null }[]): Promise<void>;
    deleteTasks(ids: string[]): Promise<void>;
    clearCategory(category: string): Promise<number>;
    moveCategory(fromCategory: string, toCategory: string): Promise<number>;
}

/**
 * Registers standard TODO tools on any McpServer instance.
 * Designed with authoritative directives, safety confirmations, and full diagnostics logging.
 */
export function registerTodoTools(mcpServer: McpServer, store: ITodoStore) {
    // --- 1. GET TASKS ---
    mcpServer.registerTool(
        'todo_get_tasks',
        {
            description: 'MANDATORY: Always use this tool to retrieve the user\'s TODO and task list. NEVER read the .todo file directly. Returns all tasks with IDs, categories (🔵 TODO, 🟠 Active, 🟣 Backlog, 🔴 Blocked, 🟢 Completed), and due dates. ALWAYS call this first before updating or deleting specific tasks to obtain exact task IDs.',
            inputSchema: z.object({
                category: z.enum(['ALL', 'TODO', 'Active', 'Backlog', 'Blocked', 'Completed']).optional().describe('Optional category filter. Defaults to ALL.')
            }),
        },
        async (args) => {
            McpLogger.toolCall('todo_get_tasks', args);
            try {
                const allTasks = store.getTasks();
                const filterCat = args.category && args.category !== 'ALL' ? args.category : undefined;
                const tasks = filterCat
                    ? allTasks.filter((t) => (t.category || (t.completed ? 'Completed' : 'Active')) === filterCat)
                    : allTasks;

                let output = `# Current TODO List${filterCat ? ` (${filterCat})` : ''}\n\n`;

                if (tasks.length === 0) {
                    output += `*No tasks found${filterCat ? ` in category ${filterCat}` : ''}.*`;
                } else {
                    const categories: { [key: string]: TaskItem[] } = {
                        'TODO': [], 'Active': [], 'Backlog': [], 'Blocked': [], 'Completed': []
                    };

                    tasks.forEach((t) => {
                        const cat = t.category || (t.completed ? 'Completed' : 'Active');
                        if (categories[cat]) {
                            categories[cat].push(t);
                        } else {
                            categories['Active'].push(t);
                        }
                    });

                    const catVisuals: { [key: string]: string } = {
                        'TODO': '🔵 TODO',
                        'Active': '🟠 Active',
                        'Backlog': '🟣 Backlog',
                        'Blocked': '🔴 Blocked',
                        'Completed': '🟢 Completed'
                    };

                    for (const [catName, catTasks] of Object.entries(categories)) {
                        if (catTasks.length > 0) {
                            output += `## ${catVisuals[catName]}\n`;
                            catTasks.forEach((t) => {
                                const due = t.dueDate ? ` (Due: ${t.dueDate})` : '';
                                output += `- \`${t.id}\`: ${t.title}${due}\n`;
                            });
                            output += '\n';
                        }
                    }
                }

                const result = { content: [{ type: "text" as const, text: output }], isError: false };
                McpLogger.toolResult('todo_get_tasks', { taskCount: tasks.length }, false);
                return result;
            } catch (err) {
                McpLogger.toolResult('todo_get_tasks', { error: String(err) }, true);
                throw err;
            }
        }
    );

    // --- 2. ADD TASKS (BULK) ---
    mcpServer.registerTool(
        'todo_add_tasks',
        {
            description: 'MANDATORY: Use this tool to create one or more tasks. NEVER edit the .todo file directly with file edit tools, as direct file edits bypass the extension state and break real-time VS Code UI updates.',
            inputSchema: z.object({
                tasks: z.array(z.object({
                    title: z.string().describe("Clear, concise task title"),
                    category: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed"]).optional().describe("Task category. Defaults to TODO."),
                    dueDate: z.string().optional().describe("Optional date in YYYY-MM-DD format if mentioned.")
                })).describe("List of tasks to create")
            }),
        },
        async (args) => {
            McpLogger.toolCall('todo_add_tasks', args);
            const { tasks } = args;
            if (!tasks || tasks.length === 0) {
                const res = { content: [{ type: "text" as const, text: "No tasks provided to add." }], isError: true };
                McpLogger.toolResult('todo_add_tasks', res, true);
                return res;
            }

            try {
                await store.addTasks(tasks);
                const res = {
                    content: [{ type: "text" as const, text: `Success: Bulk added ${tasks.length} task(s) to the TODO list.` }],
                    isError: false
                };
                McpLogger.toolResult('todo_add_tasks', { addedCount: tasks.length, titles: tasks.map(t => t.title) }, false);
                return res;
            } catch (err) {
                McpLogger.toolResult('todo_add_tasks', { error: String(err) }, true);
                throw err;
            }
        }
    );

    // --- 3. UPDATE TASKS (BULK) ---
    mcpServer.registerTool(
        'todo_update_tasks',
        {
            description: 'MANDATORY: Bulk updates existing tasks (e.g. move to Active, mark as Completed, change title, set due date). NEVER edit the .todo file directly. Run todo_get_tasks first to obtain the exact task IDs.',
            inputSchema: z.object({
                updates: z.array(z.object({
                    id: z.string().describe("The exact task ID from todo_get_tasks"),
                    title: z.string().optional().describe("New title. Leave undefined to keep existing."),
                    category: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed"]).optional().describe("New category to move the task into."),
                    dueDate: z.string().optional().describe("New due date (YYYY-MM-DD) or null to remove.")
                })).describe("List of partial updates for existing tasks")
            }),
        },
        async (args) => {
            McpLogger.toolCall('todo_update_tasks', args);
            const { updates } = args;
            if (!updates || updates.length === 0) {
                const res = { content: [{ type: "text" as const, text: "No updates provided." }], isError: true };
                McpLogger.toolResult('todo_update_tasks', res, true);
                return res;
            }

            try {
                await store.updateTasks(updates);
                const res = {
                    content: [{ type: "text" as const, text: `Success: Processed updates for ${updates.length} task(s).` }],
                    isError: false
                };
                McpLogger.toolResult('todo_update_tasks', { updatedCount: updates.length }, false);
                return res;
            } catch (err) {
                McpLogger.toolResult('todo_update_tasks', { error: String(err) }, true);
                throw err;
            }
        }
    );

    // --- 4. DELETE TASKS (BY ID) ---
    mcpServer.registerTool(
        'todo_delete_tasks',
        {
            description: 'MANDATORY: Bulk deletes tasks by exact ID list. NEVER edit the .todo file directly. Run todo_get_tasks first to obtain the IDs.',
            inputSchema: z.object({
                ids: z.array(z.string()).describe("List of exact task IDs to permanently delete.")
            }),
        },
        async (args) => {
            McpLogger.toolCall('todo_delete_tasks', args);
            const { ids } = args;
            if (!ids || ids.length === 0) {
                const res = { content: [{ type: "text" as const, text: "No IDs provided to delete." }], isError: true };
                McpLogger.toolResult('todo_delete_tasks', res, true);
                return res;
            }

            try {
                await store.deleteTasks(ids);
                const res = {
                    content: [{ type: "text" as const, text: `Success: Deleted ${ids.length} task(s).` }],
                    isError: false
                };
                McpLogger.toolResult('todo_delete_tasks', { deletedIds: ids }, false);
                return res;
            } catch (err) {
                McpLogger.toolResult('todo_delete_tasks', { error: String(err) }, true);
                throw err;
            }
        }
    );

    // --- 5. CLEAR CATEGORY (WITH CONFIRMATION STEP) ---
    mcpServer.registerTool(
        'todo_clear_category',
        {
            description: 'Deletes all tasks in a specific category (e.g., "delete all blocked tasks", "clear completed tasks"). Includes a mandatory confirmation step to prevent accidental bulk deletions without warning.',
            inputSchema: z.object({
                category: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed", "ALL"]).describe("Category to clear, or ALL to clear everything."),
                confirm: z.boolean().describe("Safety confirmation. MUST be set to true to execute deletion. If false, returns a preview list of tasks that will be deleted.")
            }),
        },
        async (args) => {
            McpLogger.toolCall('todo_clear_category', args);
            const { category, confirm } = args;
            const tasks = store.getTasks();

            const matchingTasks = category === 'ALL'
                ? tasks
                : tasks.filter((t) => (t.category || (t.completed ? 'Completed' : 'Active')) === category);

            if (matchingTasks.length === 0) {
                const res = {
                    content: [{ type: "text" as const, text: `No tasks found in category "${category}". Nothing to delete.` }],
                    isError: false
                };
                McpLogger.toolResult('todo_clear_category', { message: 'Category empty' }, false);
                return res;
            }

            if (!confirm) {
                const previewList = matchingTasks.map((t) => `- [${t.id}] ${t.title}`).join('\n');
                const res = {
                    content: [{
                        type: "text" as const,
                        text: `⚠️ CONFIRMATION REQUIRED: You requested to delete all ${matchingTasks.length} task(s) in category "${category}".\n\nTasks to be deleted:\n${previewList}\n\nTo confirm and permanently delete these tasks, call todo_clear_category again with confirm: true.`
                    }],
                    isError: false
                };
                McpLogger.toolResult('todo_clear_category', { previewPendingConfirmation: matchingTasks.length }, false);
                return res;
            }

            try {
                const deletedCount = await store.clearCategory(category);
                const res = {
                    content: [{ type: "text" as const, text: `Success: Confirmed and deleted ${deletedCount} task(s) from category "${category}".` }],
                    isError: false
                };
                McpLogger.toolResult('todo_clear_category', { deletedCount, category }, false);
                return res;
            } catch (err) {
                McpLogger.toolResult('todo_clear_category', { error: String(err) }, true);
                throw err;
            }
        }
    );

    // --- 6. MOVE CATEGORY ---
    mcpServer.registerTool(
        'todo_move_category',
        {
            description: 'Moves all tasks from one category to another (e.g. "move all backlog tasks to active", "activate all TODO tasks").',
            inputSchema: z.object({
                fromCategory: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed"]).describe("Source category to move tasks from."),
                toCategory: z.enum(["TODO", "Active", "Backlog", "Blocked", "Completed"]).describe("Destination category to move tasks to.")
            }),
        },
        async (args) => {
            McpLogger.toolCall('todo_move_category', args);
            const { fromCategory, toCategory } = args;
            if (fromCategory === toCategory) {
                const res = { content: [{ type: "text" as const, text: `Source and destination categories are identical ("${fromCategory}"). No change.` }], isError: false };
                McpLogger.toolResult('todo_move_category', { message: 'Identical categories' }, false);
                return res;
            }

            try {
                const movedCount = await store.moveCategory(fromCategory, toCategory);
                const res = {
                    content: [{ type: "text" as const, text: `Success: Moved ${movedCount} task(s) from "${fromCategory}" to "${toCategory}".` }],
                    isError: false
                };
                McpLogger.toolResult('todo_move_category', { movedCount, fromCategory, toCategory }, false);
                return res;
            } catch (err) {
                McpLogger.toolResult('todo_move_category', { error: String(err) }, true);
                throw err;
            }
        }
    );
}
