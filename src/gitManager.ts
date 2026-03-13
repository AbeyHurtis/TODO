import * as vscode from 'vscode';
import { TodoViewProvider } from './TodoViewProvider';

export class GitManager {
    private _gitApi: any;

    constructor(private readonly _provider: TodoViewProvider) {
        this._initGitApi();
    }

    private async _initGitApi() {
        const extension = vscode.extensions.getExtension('vscode.git');
        if (extension) {
            const exports = await extension.activate();
            this._gitApi = exports.getAPI(1);
            this._setupListeners();
        }
    }

    private _setupListeners() {
        if (!this._gitApi) return;

        // Listen for commits in all repositories
        this._gitApi.repositories.forEach((repo: any) => {
            repo.onDidCommit(() => this._handleCommit(repo));
        });

        // Also listen for new repositories being opened
        this._gitApi.onDidOpenRepository((repo: any) => {
            repo.onDidCommit(() => this._handleCommit(repo));
        });
    }

    private async _handleCommit(repository: any) {
        // Get the last commit
        try {
            // The commit event doesn't directly give us the message easily in some versions,
            // so we fetch the HEAD commit details.
            const head = repository.state.HEAD;
            if (!head || !head.commit) {
                // If it's a fresh commit, it might not be in HEAD yet or we might need to wait a tick
                setTimeout(async () => {
                    const latestCommit = await repository.getCommit('HEAD');
                    if (latestCommit) {
                        this._processCommitMessage(latestCommit.message);
                    }
                }, 500);
                return;
            }

            const commit = await repository.getCommit(head.commit);
            if (commit) {
                this._processCommitMessage(commit.message);
            }
        } catch (err) {
            console.error('Error reading commit:', err);
        }
    }

    private _processCommitMessage(message: string) {
        if (!message) return;

        // Pattern 1: Look for "fixes #id" or "closes #id"
        // Pattern 2: Look for titles of active tasks in the message
        
        const tasks = this._provider.getTasks();
        const activeTasks = tasks.filter(t => t.category !== 'Completed');

        let matched = false;

        for (const task of activeTasks) {
            // Case-insensitive match for task title in commit message
            // or match specific IDs if we decide to show them
            if (message.toLowerCase().includes(task.title.toLowerCase())) {
                this._provider.changeCategory(task.id, 'Completed');
                matched = true;
            }
        }

        if (matched) {
            vscode.window.showInformationMessage(`TODO: Tasks updated based on your commit!`);
        }
    }
}
