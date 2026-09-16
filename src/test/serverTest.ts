import { TodoMcpServer } from '../mcpServer';
import { ITodoStore, TaskItem } from '../todoTools';
import * as assert from 'assert';

class MockTodoStore implements ITodoStore {
    private tasks: TaskItem[] = [];

    getTasks(): TaskItem[] {
        return this.tasks;
    }
    async addTasks(tasks: { title: string; dueDate?: string | null; category?: string; id?: string }[]): Promise<void> {
        for (const t of tasks) {
            this.tasks.push({
                id: t.id || Math.random().toString(),
                title: t.title,
                category: t.category || 'TODO',
                dueDate: t.dueDate,
                completed: t.category === 'Completed'
            });
        }
    }
    async updateTasks(updates: { id: string; title?: string; category?: string; dueDate?: string | null }[]): Promise<void> {
        for (const u of updates) {
            const task = this.tasks.find(t => t.id === u.id);
            if (task) {
                if (u.title !== undefined) task.title = u.title;
                if (u.category !== undefined) task.category = u.category;
            }
        }
    }
    async deleteTasks(ids: string[]): Promise<void> {
        this.tasks = this.tasks.filter(t => !ids.includes(t.id));
    }
    async clearCategory(category: string): Promise<number> {
        const initial = this.tasks.length;
        this.tasks = this.tasks.filter(t => t.category !== category);
        return initial - this.tasks.length;
    }
    async moveCategory(fromCategory: string, toCategory: string): Promise<number> {
        let count = 0;
        for (const t of this.tasks) {
            if (t.category === fromCategory) {
                t.category = toCategory;
                count++;
            }
        }
        return count;
    }
}

async function testTodoMcpServer() {
    const store = new MockTodoStore();
    const server = new TodoMcpServer(store);

    // 1. Start server on dynamic port
    const uri = await server.start(0);
    assert.ok(server.isRunning(), "Server should be running");
    assert.ok(server.getPort() > 0, "Server port should be > 0");
    assert.ok(uri.startsWith("http://127.0.0.1:"), "URI should point to 127.0.0.1");

    console.log(`Server started on ${uri}`);

    // 2. Stop server
    await server.stop();
    assert.strictEqual(server.isRunning(), false, "Server should be stopped");

    console.log('✓ TodoMcpServer lifecycle test passed successfully!');
}

testTodoMcpServer().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
