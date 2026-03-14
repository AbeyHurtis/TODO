import * as vscode from 'vscode';
import { TodoViewProvider } from './TodoViewProvider';

export class HeuristicTracker {
    private editTimes = new Map<string, number>();

    constructor(
        private provider: TodoViewProvider,
        private context: vscode.ExtensionContext
    ) {
        this.registerListeners();
    }

    private registerListeners() {
        // Track time spent in a file
        vscode.workspace.onDidChangeTextDocument(event => {
            const uri = event.document.uri.toString();
            if (!this.editTimes.has(uri)) {
                this.editTimes.set(uri, Date.now());
            }

            // Simple heuristic to detect large deletions (potential LLM fail/revert)
            let totalDeleted = 0;
            let totalAdded = 0;
            for (const change of event.contentChanges) {
                totalDeleted += change.rangeLength;
                totalAdded += change.text.length;
            }

            // If a huge chunk of code was deleted without adding much, maybe ask to track?
            if (totalDeleted > 500 && totalAdded < 50) {
                const basename = vscode.workspace.asRelativePath(event.document.uri);
                vscode.window.showInformationMessage(`Looks like you reverted or deleted code in ${basename}. Blocked?`, 'Add Task', 'Ignore').then(res => {
                    if (res === 'Add Task') {
                        this.provider.addTask(`Review blocked/reverted work in ${basename}`, null, 'Blocked');
                        vscode.commands.executeCommand('todo-explorer.focus');
                    }
                });
            }
        });

        // Track closing files after long edits without committing? Or just clean up.
        vscode.workspace.onDidCloseTextDocument(doc => {
            this.editTimes.delete(doc.uri.toString());
        });
    }

    public registerContextMenuCommand() {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('todo.addBlockedTaskFromSelection', () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active text editor');
                    return;
                }

                const selection = editor.selection;
                if (selection.isEmpty) {
                    vscode.window.showErrorMessage('No text selected to add as blocked task.');
                    return;
                }

                const selectedText = editor.document.getText(selection);
                const firstLine = selectedText.split('\n')[0].substring(0, 50).trim();
                const basename = vscode.workspace.asRelativePath(editor.document.uri);
                
                const taskTitle = `Blocked on: ${firstLine}... in ${basename}`;
                this.provider.addTask(taskTitle, null, 'Blocked');
                vscode.window.showInformationMessage('Added blocked task from selection.', 'Show Tasks').then((res) => {
                    if (res === 'Show Tasks') {
                        vscode.commands.executeCommand('todo-explorer.focus');
                    }
                });
            })
        );
    }
}
