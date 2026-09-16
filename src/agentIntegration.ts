import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { McpLogger } from './logger';

const SKILL_MD_CONTENT = `---
name: todo-tracker
description: View, add, update, move, and delete tasks/todos in the active project using the TODO MCP server. Use whenever the user asks to manage, add, view, complete, block, or delete TODO tasks instead of editing the .todo file directly.
---

# TODO Tracker MCP Skill

When the user asks to view, query, add, update, start, complete, block, or delete tasks:
**MANDATORY: DO NOT edit the \`.todo\` file directly.** Direct file edits bypass extension state and break real-time VS Code UI synchronization.

Always invoke the \`todo-mcp\` (or \`todo-extension\`) MCP server using \`call_mcp_tool\`:

## Available Tools & Exact Arguments

### 1. \`todo_get_tasks\`
Retrieves all tasks with IDs, categories (🔵 TODO, 🟠 Active, 🟣 Backlog, 🔴 Blocked, 🟢 Completed), and due dates. ALWAYS run this first when finding IDs to update or delete.
- **ServerName**: \`todo-mcp\` *(or \`todo-extension\`)*
- **ToolName**: \`todo_get_tasks\`
- **Arguments**:
\`\`\`json
{
  "category": "ALL"
}
\`\`\`
*(Optional category values: "ALL", "TODO", "Active", "Backlog", "Blocked", "Completed")*

---

### 2. \`todo_add_tasks\`
Creates one or more new tasks.
- **ServerName**: \`todo-mcp\` *(or \`todo-extension\`)*
- **ToolName**: \`todo_add_tasks\`
- **Arguments**:
\`\`\`json
{
  "tasks": [
    {
      "title": "Task title here",
      "category": "TODO",
      "dueDate": "YYYY-MM-DD"
    }
  ]
}
\`\`\`
*(Category options: "TODO", "Active", "Backlog", "Blocked", "Completed". dueDate is optional.)*

---

### 3. \`todo_update_tasks\`
Bulk updates existing tasks (e.g. move to Active, mark as Completed, change title or due date).
- **ServerName**: \`todo-mcp\` *(or \`todo-extension\`)*
- **ToolName**: \`todo_update_tasks\`
- **Arguments**:
\`\`\`json
{
  "updates": [
    {
      "id": "exact_task_id_from_todo_get_tasks",
      "title": "New title (optional)",
      "category": "Active",
      "dueDate": "YYYY-MM-DD"
    }
  ]
}
\`\`\`

---

### 4. \`todo_delete_tasks\`
Deletes specific tasks by ID list.
- **ServerName**: \`todo-mcp\` *(or \`todo-extension\`)*
- **ToolName**: \`todo_delete_tasks\`
- **Arguments**:
\`\`\`json
{
  "ids": ["exact_task_id_1", "exact_task_id_2"]
}
\`\`\`

---

### 5. \`todo_clear_category\`
Deletes all tasks in a category in one call (e.g. "delete all blocked tasks", "clear completed").
- **ServerName**: \`todo-mcp\` *(or \`todo-extension\`)*
- **ToolName**: \`todo_clear_category\`
- **Arguments**:
\`\`\`json
{
  "category": "Blocked",
  "confirm": true
}
\`\`\`
*(Category options: "TODO", "Active", "Backlog", "Blocked", "Completed", "ALL". confirm must be true.)*

---

### 6. \`todo_move_category\`
Moves all tasks from one category to another (e.g. "move all backlog tasks to active").
- **ServerName**: \`todo-mcp\` *(or \`todo-extension\`)*
- **ToolName**: \`todo_move_category\`
- **Arguments**:
\`\`\`json
{
  "fromCategory": "Backlog",
  "toCategory": "Active"
}
\`\`\`
`;

const CURSOR_MDC_CONTENT = `---
description: Rules for managing project tasks and TODOs via MCP
globs: ["**/*", ".todo"]
---

# Task Management & TODO Rules
- When viewing, querying, adding, updating, or deleting project tasks or TODOs, ALWAYS use the TODO MCP tools (\`todo_get_tasks\`, \`todo_add_tasks\`, \`todo_update_tasks\`, \`todo_delete_tasks\`, \`todo_clear_category\`, \`todo_move_category\`).
- NEVER edit the \`.todo\` file directly with file modification tools. Direct file edits bypass extension state and break real-time VS Code UI synchronization.

## Tool Quick Reference:
- **Add Tasks**: \`todo_add_tasks({ tasks: [{ title: "...", category: "TODO" }] })\`
- **Get Tasks**: \`todo_get_tasks({ category: "ALL" })\`
- **Update Tasks**: \`todo_update_tasks({ updates: [{ id: "...", category: "Active" }] })\`
- **Clear Category**: \`todo_clear_category({ category: "Blocked", confirm: true })\`
`;

const AGENTS_MD_RULE = `
# Task Management & TODO Guidelines
- When viewing, querying, adding, updating, or deleting project tasks or TODOs, ALWAYS use the TODO MCP tools (\`todo_get_tasks\`, \`todo_add_tasks\`, \`todo_update_tasks\`, \`todo_delete_tasks\`, \`todo_clear_category\`, \`todo_move_category\`) on server \`todo-mcp\` or \`todo-extension\`.
- NEVER edit the \`.todo\` file directly with file modification tools.
`.trim();

/**
 * Automatically deploys in-workspace skills, Cursor rules, AGENTS.md, and MCP configurations
 * inside the active workspace directory so agents can read schemas within their sandbox boundary.
 */
export function deployWorkspaceAgentIntegration(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;

    for (const folder of workspaceFolders) {
        const rootPath = folder.uri.fsPath;

        // 1. Deploy Antigravity / Gemini Workspace Skill: .agents/skills/todo-tracker/SKILL.md
        try {
            const skillDir = path.join(rootPath, '.agents', 'skills', 'todo-tracker');
            if (!fs.existsSync(skillDir)) {
                fs.mkdirSync(skillDir, { recursive: true });
            }
            const skillPath = path.join(skillDir, 'SKILL.md');
            fs.writeFileSync(skillPath, SKILL_MD_CONTENT, 'utf8');
            McpLogger.log(`Deployed Antigravity in-workspace skill at: ${skillPath}`);
        } catch (e) {
            McpLogger.error('Failed deploying .agents skill', e);
        }

        // 2. Deploy Cursor Rule: .cursor/rules/todo.mdc
        try {
            const cursorDir = path.join(rootPath, '.cursor', 'rules');
            if (!fs.existsSync(cursorDir)) {
                fs.mkdirSync(cursorDir, { recursive: true });
            }
            const cursorRulePath = path.join(cursorDir, 'todo.mdc');
            fs.writeFileSync(cursorRulePath, CURSOR_MDC_CONTENT, 'utf8');
            McpLogger.log(`Deployed Cursor rule at: ${cursorRulePath}`);
        } catch (e) {
            McpLogger.error('Failed deploying Cursor rule', e);
        }

        // 3. Deploy AGENTS.md
        try {
            const agentsPath = path.join(rootPath, 'AGENTS.md');
            if (fs.existsSync(agentsPath)) {
                const existing = fs.readFileSync(agentsPath, 'utf8');
                if (!existing.includes('TODO MCP tools')) {
                    fs.appendFileSync(agentsPath, `\n\n${AGENTS_MD_RULE}\n`, 'utf8');
                }
            } else {
                fs.writeFileSync(agentsPath, `${AGENTS_MD_RULE}\n`, 'utf8');
            }
            McpLogger.log(`Deployed AGENTS.md at: ${agentsPath}`);
        } catch (e) {
            McpLogger.error('Failed deploying AGENTS.md', e);
        }

        // 4. Deploy CLAUDE.md
        try {
            const claudePath = path.join(rootPath, 'CLAUDE.md');
            if (fs.existsSync(claudePath)) {
                const existing = fs.readFileSync(claudePath, 'utf8');
                if (!existing.includes('TODO MCP tools')) {
                    fs.appendFileSync(claudePath, `\n\n${AGENTS_MD_RULE}\n`, 'utf8');
                }
            } else {
                fs.writeFileSync(claudePath, `${AGENTS_MD_RULE}\n`, 'utf8');
            }
            McpLogger.log(`Deployed CLAUDE.md at: ${claudePath}`);
        } catch (e) {
            McpLogger.error('Failed deploying CLAUDE.md', e);
        }
    }
}
