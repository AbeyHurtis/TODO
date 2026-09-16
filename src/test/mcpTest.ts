import { FileTodoStore } from '../stdioServer';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

async function testFileTodoStore() {
    const testDir = path.join(__dirname, '..', '..', 'scratch_test');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    const store = new FileTodoStore(testDir);
    
    // 1. Initial should be empty
    assert.deepStrictEqual(store.getTasks(), []);

    // 2. Add tasks across multiple categories
    await store.addTasks([
        { title: "Task 1", category: "TODO", dueDate: "2026-10-01" },
        { title: "Task 2", category: "Blocked" },
        { title: "Task 3", category: "Blocked" },
        { title: "Task 4", category: "Active" }
    ]);

    const tasksAfterAdd = store.getTasks();
    assert.strictEqual(tasksAfterAdd.length, 4);

    // Verify in-file instruction is written
    const todoFile = path.join(testDir, '.todo');
    assert.ok(fs.existsSync(todoFile));
    const fileContent = JSON.parse(fs.readFileSync(todoFile, 'utf8'));
    assert.ok(fileContent.$instruction, "$instruction field must be present in .todo");
    assert.ok(fileContent.$instruction.includes("DO NOT EDIT DIRECTLY"));

    // 3. Clear category ('Blocked')
    const deletedCount = await store.clearCategory('Blocked');
    assert.strictEqual(deletedCount, 2, "Should have deleted 2 blocked tasks");
    const tasksAfterClear = store.getTasks();
    assert.strictEqual(tasksAfterClear.length, 2);
    assert.ok(!tasksAfterClear.some(t => t.category === 'Blocked'));

    // 4. Move category ('TODO' -> 'Active')
    const movedCount = await store.moveCategory('TODO', 'Active');
    assert.strictEqual(movedCount, 1, "Should have moved 1 task from TODO to Active");
    const tasksAfterMove = store.getTasks();
    assert.ok(tasksAfterMove.every(t => t.category === 'Active'));

    // Cleanup
    if (fs.existsSync(todoFile)) {
        fs.unlinkSync(todoFile);
    }
    fs.rmdirSync(testDir);

    console.log('✓ FileTodoStore & Category operation tests passed successfully!');
}

testFileTodoStore().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
