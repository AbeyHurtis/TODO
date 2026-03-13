import * as vscode from 'vscode';
import { TodoViewProvider } from './TodoViewProvider';

export function activate(context: vscode.ExtensionContext) {
	const provider = new TodoViewProvider(context.extensionUri, context.globalState);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TodoViewProvider.viewType, provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('todo.addTask', () => {
			provider.addTaskPrompt();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('todo.clearCompleted', () => {
			provider.clearCompleted();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('todo.clearActive', () => {
			provider.clearActive();
		})
	);
}
