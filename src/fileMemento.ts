import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FileMemento implements vscode.Memento {
    private _filePath: string | undefined;
    public static lastInternalWriteTime: number = 0;

    constructor() {
        this._updateFilePath();
    }

    private _updateFilePath() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this._filePath = path.join(workspaceFolders[0].uri.fsPath, '.todo');
        } else {
            this._filePath = undefined;
        }
    }

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get<T>(key: string, defaultValue?: T): T | undefined {
        this._updateFilePath();
        if (!this._filePath || !fs.existsSync(this._filePath)) {
            return defaultValue;
        }

        try {
            const content = fs.readFileSync(this._filePath, 'utf8');
            const data = JSON.parse(content);
            return data[key] !== undefined ? data[key] : defaultValue;
        } catch (e) {
            console.error(`[TODO] Error reading .todo file: ${e}`);
            return defaultValue;
        }
    }

    public async update(key: string, value: any): Promise<void> {
        this._updateFilePath();
        if (!this._filePath) {
            vscode.window.showErrorMessage('No workspace folder open to save .todo file.');
            return;
        }

        let data: any = {};
        if (fs.existsSync(this._filePath)) {
            try {
                const content = fs.readFileSync(this._filePath, 'utf8');
                data = JSON.parse(content);
            } catch (e) {
                console.error(`[TODO] Error parsing .todo file for update: ${e}`);
            }
        }

        if (value === undefined) {
            delete data[key];
        } else {
            data[key] = value;
        }

        // Add explicit instruction header for LLMs reading this file
        const outputData: any = {
            "$instruction": "⚠️ DO NOT EDIT DIRECTLY. Use the TODO MCP tools (todo_get_tasks, todo_add_tasks, todo_update_tasks, todo_delete_tasks, todo_clear_category) to ensure live VS Code UI synchronization.",
            ...data
        };

        try {
            FileMemento.lastInternalWriteTime = Date.now();
            fs.writeFileSync(this._filePath, JSON.stringify(outputData, null, 2), 'utf8');
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to write to .todo file: ${e}`);
        }
    }

    public keys(): readonly string[] {
        this._updateFilePath();
        if (!this._filePath || !fs.existsSync(this._filePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this._filePath, 'utf8');
            const data = JSON.parse(content);
            return Object.keys(data).filter(k => !k.startsWith('$'));
        } catch (e) {
            return [];
        }
    }

    public setKeysForSync(keys: readonly string[]): void {
        // Not implemented for local file memento
    }
}
