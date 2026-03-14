import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { TodoViewProvider } from './TodoViewProvider';
import { GitManager } from './gitManager';
import { registerChatParticipant } from './chatParticipant';
import { HeuristicTracker } from './heuristicTracker';
import { TodoMcpServer } from './mcpServer';

export function activate(context: vscode.ExtensionContext) {

	const provider = new TodoViewProvider(context.extensionUri, context.globalState);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TodoViewProvider.viewType, provider)
	);

	const gitManager = new GitManager(provider);
	const mcpServer = new TodoMcpServer(provider);
	let serverUri: vscode.Uri | undefined;

	const definitionsEmitter = new vscode.EventEmitter<void>();
	const installationsEmitter = new vscode.EventEmitter<void>();

	// 2. Start Server
	mcpServer.start().then(async (uri: vscode.Uri) => {
		serverUri = uri;
		console.log(`[TODO MCP] Server started and URI stored: ${uri.toString()}`);

		definitionsEmitter.fire();
		installationsEmitter.fire();

		// Update MCP configs so external agents (like Antigravity or Claude) can see it
		const updateConfig = (configPath: string) => {
			try {
				let config: any = { mcpServers: {} };
				if (existsSync(configPath)) {
					const content = readFileSync(configPath, 'utf8');
					if (content.trim()) {
						config = JSON.parse(content);
					}
				}
				if (!config.mcpServers) config.mcpServers = {};

				config.mcpServers["todo-extension"] = {
					"url": uri.toString(),
					"serverURL": uri.toString()
				};

				// Ensure directory exists
				const dir = dirname(configPath);
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}

				writeFileSync(configPath, JSON.stringify(config, null, 2));
				console.log(`[TODO MCP] Updated config at: ${configPath}`);
			} catch (e) {
				console.error(`[TODO MCP] Failed to update config at ${configPath}:`, e);
			}
		};

		const home = homedir();
		updateConfig(join(home, '.gemini', 'antigravity', 'mcp_config.json'));
		updateConfig(join(home, '.cursor', 'mcp.json'));
		updateConfig(join(home, '.vscode', 'mcp.json'));
		updateConfig(join(home, 'Library', 'Application Support', 'Claude', 'mcp.json'));
		updateConfig(join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'));
		updateConfig(join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'mcp.json'));

		// Attempt to register with Cursor IDE natively
		try {
			await vscode.commands.executeCommand('cursor.mcp.registerServer', {
				id: 'todo-mcp-server',
				type: 'sse',
				url: uri.toString()
			});
			console.log('[TODO MCP] Successfully registered with Cursor.');
		} catch (error) {
			console.log('[TODO MCP] Cursor MCP API not available or registration failed.');
		}

		vscode.window.showInformationMessage(`TODO MCP Server is active on ${uri.authority}`);
	});

	// 3. Register Definition Provider
	context.subscriptions.push(
		vscode.lm.registerMcpServerDefinitionProvider('Hurtis.TODO', {
			onDidChangeMcpServerDefinitions: definitionsEmitter.event,
			provideMcpServerDefinitions: () => {
				console.log("[TODO MCP] provideMcpServerDefinitions called. URI is:", serverUri?.toString());
				if (!serverUri) return [];
				return [
					new vscode.McpHttpServerDefinition(
						'TODO Extension Server',
						serverUri
					)
				];
			}
		})
	);

	// 4. Debug Command to inspect state
	context.subscriptions.push(
		vscode.commands.registerCommand('todo.debugMcp', () => {
			const state = {
				hasUri: !!serverUri,
				uri: serverUri?.toString(),
				lmProps: Object.keys(vscode.lm),
			};
			console.log("[TODO MCP] Debug State:", JSON.stringify(state, null, 2));
			vscode.window.showInformationMessage(`MCP Debug: URI is ${state.uri ? 'set' : 'not set'}`);
		})
	);

	context.subscriptions.push(definitionsEmitter, installationsEmitter);

	registerChatParticipant(context, provider);

	const tracker = new HeuristicTracker(provider, context);
	tracker.registerContextMenuCommand();

	context.subscriptions.push(
		vscode.commands.registerCommand('todo.addTask', () => provider.addTaskPrompt()),
		vscode.commands.registerCommand('todo.clearCompleted', () => provider.clearCompleted()),
		vscode.commands.registerCommand('todo.clearActive', () => provider.clearActive())
	);
}
