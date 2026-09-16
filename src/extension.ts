import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { TodoViewProvider } from './TodoViewProvider';
import { GitManager } from './gitManager';
import { registerChatParticipant } from './chatParticipant';
import { HeuristicTracker } from './heuristicTracker';
import { TodoMcpServer } from './mcpServer';
import { FileMemento } from './fileMemento';
import { McpLogger } from './logger';
import { deployWorkspaceAgentIntegration } from './agentIntegration';

let activeMcpServer: TodoMcpServer | undefined;
let serverUri: vscode.Uri | undefined;

function getGlobalConfigPaths(): string[] {
	const home = homedir();
	return [
		join(home, '.gemini', 'antigravity', 'mcp_config.json'),
		join(home, '.cursor', 'mcp.json'),
		join(home, '.vscode', 'mcp.json'),
		join(home, 'Library', 'Application Support', 'Claude', 'mcp.json'),
		join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'),
		join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'mcp.json')
	];
}

function getWorkspaceConfigPaths(): string[] {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) return [];
	const root = workspaceFolders[0].uri.fsPath;
	return [
		join(root, '.cursor', 'mcp.json'),
		join(root, '.vscode', 'mcp.json'),
		join(root, '.gemini', 'mcp_config.json')
	];
}

function updateMcpConfigFile(configPath: string, serverKey: string, serverDefinition: any) {
	try {
		let config: any = { mcpServers: {} };
		if (existsSync(configPath)) {
			const content = readFileSync(configPath, 'utf8');
			if (content.trim()) {
				config = JSON.parse(content);
			}
		}
		if (!config.mcpServers) config.mcpServers = {};

		config.mcpServers[serverKey] = serverDefinition;

		const dir = dirname(configPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
		McpLogger.log(`Configured '${serverKey}' in: ${configPath}`);
	} catch (e) {
		McpLogger.error(`Failed to update config at ${configPath}`, e);
	}
}

function registerAllMcpConfigs(context: vscode.ExtensionContext) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
	const stdioScriptPath = join(context.extensionPath, 'bin', 'todo-mcp.js');

	const stdioDefinition = {
		"command": "node",
		"args": [
			stdioScriptPath,
			"--workspace",
			workspaceFolder
		]
	};

	// 1. Clean up stale ephemeral HTTP configs first
	cleanupExternalConfigs();

	// 2. Register Stdio server to workspace configs
	const wsPaths = getWorkspaceConfigPaths();
	for (const wsPath of wsPaths) {
		updateMcpConfigFile(wsPath, "todo-mcp", stdioDefinition);
	}

	// 3. Register Stdio server to global configs
	const globalPaths = getGlobalConfigPaths();
	for (const globalPath of globalPaths) {
		updateMcpConfigFile(globalPath, "todo-mcp", stdioDefinition);
	}
}

function cleanupExternalConfigs() {
	const allPaths = [...getWorkspaceConfigPaths(), ...getGlobalConfigPaths()];
	for (const configPath of allPaths) {
		try {
			if (!existsSync(configPath)) continue;
			const content = readFileSync(configPath, 'utf8');
			if (!content.trim()) continue;

			const config = JSON.parse(content);
			if (!config.mcpServers) continue;

			let modified = false;
			for (const key of Object.keys(config.mcpServers)) {
				if (key === 'todo-extension' || key.startsWith('todo-extension-')) {
					delete config.mcpServers[key];
					modified = true;
				}
			}

			if (modified) {
				writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
				McpLogger.log(`Cleaned up ephemeral HTTP configs from: ${configPath}`);
			}
		} catch (e) {
			McpLogger.error(`Failed cleaning config at ${configPath}`, e);
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	// 1. Initialize Logger & Output Channel
	const outputChannel = vscode.window.createOutputChannel('TODO MCP');
	McpLogger.init(outputChannel);
	context.subscriptions.push(outputChannel);

	McpLogger.log('Extension activating...');

	const storageScope = vscode.workspace.getConfiguration('todo').get<string>('storageScope', 'file');
	let state: vscode.Memento;

	if (storageScope === 'file') {
		state = new FileMemento();
	} else {
		state = storageScope === 'workspace' ? context.workspaceState : context.globalState;
	}

	McpLogger.log(`Active Workspace: ${vscode.workspace.name || 'none'}. Storage Scope: ${storageScope}.`);

	// Auto-deploy in-workspace skills (.agents/skills/todo-tracker/SKILL.md), Cursor rules, AGENTS.md
	deployWorkspaceAgentIntegration(context);

	const provider = new TodoViewProvider(context.extensionUri, state);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TodoViewProvider.viewType, provider)
	);

	// Setup Non-Blocking, Debounced File Watcher on .todo
	let fileWatchDebounceTimer: NodeJS.Timeout | undefined;
	const todoWatcher = vscode.workspace.createFileSystemWatcher('**/.todo');
	const handleFileChange = () => {
		if (Date.now() - FileMemento.lastInternalWriteTime < 600) {
			return;
		}

		if (fileWatchDebounceTimer) {
			clearTimeout(fileWatchDebounceTimer);
		}
		fileWatchDebounceTimer = setTimeout(() => {
			McpLogger.log('.todo file modified externally on disk. Refreshing UI...');
			provider.refresh();
		}, 200);
	};

	todoWatcher.onDidChange(handleFileChange);
	todoWatcher.onDidCreate(handleFileChange);
	todoWatcher.onDidDelete(handleFileChange);
	context.subscriptions.push(todoWatcher);

	const gitManager = new GitManager(provider);
	const mcpServer = new TodoMcpServer(provider);
	activeMcpServer = mcpServer;

	const definitionsEmitter = new vscode.EventEmitter<void>();
	const installationsEmitter = new vscode.EventEmitter<void>();

	const startMcpIfEnabled = async () => {
		const mcpConfig = vscode.workspace.getConfiguration('todo.mcp');
		const isEnabled = mcpConfig.get<boolean>('enabled', true);
		const configuredPort = mcpConfig.get<number>('port', 0);
		const autoRegister = mcpConfig.get<boolean>('autoRegisterConfig', true);

		if (!isEnabled) {
			if (mcpServer.isRunning()) {
				await mcpServer.stop();
				serverUri = undefined;
				definitionsEmitter.fire();
				cleanupExternalConfigs();
			}
			return;
		}

		try {
			const serverUrl = await mcpServer.start(configuredPort);
			const uri = vscode.Uri.parse(serverUrl);
			serverUri = uri;
			McpLogger.log(`Server started and URI stored: ${uri.toString()}`);

			definitionsEmitter.fire();
			installationsEmitter.fire();

			if (autoRegister) {
				registerAllMcpConfigs(context);
				deployWorkspaceAgentIntegration(context);
			}

			try {
				await vscode.commands.executeCommand('cursor.mcp.registerServer', {
					id: 'todo-mcp-server',
					type: 'sse',
					url: uri.toString()
				});
			} catch {
				// Cursor MCP API not available
			}
		} catch (e) {
			McpLogger.error('Failed to start MCP HTTP server', e);
		}
	};

	startMcpIfEnabled();

	// Register Definition Provider for VS Code's native language model
	context.subscriptions.push(
		vscode.lm.registerMcpServerDefinitionProvider('Hurtis.TODO', {
			onDidChangeMcpServerDefinitions: definitionsEmitter.event,
			provideMcpServerDefinitions: () => {
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

	// Command: Show MCP Logs
	context.subscriptions.push(
		vscode.commands.registerCommand('todo.showMcpLogs', () => {
			McpLogger.show();
		})
	);

	// Command: Verify MCP Setup & Tool Discovery
	context.subscriptions.push(
		vscode.commands.registerCommand('todo.verifyMcpSetup', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const root = workspaceFolders?.[0]?.uri.fsPath;
			const skillPath = root ? join(root, '.agents', 'skills', 'todo-tracker', 'SKILL.md') : undefined;
			const cursorMcp = root ? join(root, '.cursor', 'mcp.json') : undefined;
			const vscodeMcp = root ? join(root, '.vscode', 'mcp.json') : undefined;
			const cursorRule = root ? join(root, '.cursor', 'rules', 'todo.mdc') : undefined;

			const hasSkill = skillPath ? existsSync(skillPath) : false;
			const hasCursorMcp = cursorMcp ? existsSync(cursorMcp) : false;
			const hasVscodeMcp = vscodeMcp ? existsSync(vscodeMcp) : false;
			const hasRule = cursorRule ? existsSync(cursorRule) : false;

			const statusText = [
				`🔌 HTTP Server: ${activeMcpServer?.isRunning() ? `RUNNING on port ${activeMcpServer.getPort()}` : 'STOPPED'}`,
				`🧠 In-Workspace Skill (.agents/skills/todo-tracker): ${hasSkill ? '✅ Deployed' : '⚠️ Missing'}`,
				`📁 Workspace .cursor/mcp.json: ${hasCursorMcp ? '✅ Configured' : '⚠️ Missing'}`,
				`📁 Workspace .vscode/mcp.json: ${hasVscodeMcp ? '✅ Configured' : '⚠️ Missing'}`,
				`📜 Cursor Rule (.cursor/rules/todo.mdc): ${hasRule ? '✅ Configured' : '⚠️ Missing'}`
			].join('\n');

			McpLogger.log(`Setup Verification:\n${statusText}`);

			const action = await vscode.window.showInformationMessage(
				`TODO MCP Status:\n\n${statusText}`,
				'Open MCP Logs',
				'Deploy Skills & Rules',
				'Register Configs'
			);

			if (action === 'Open MCP Logs') {
				McpLogger.show();
			} else if (action === 'Deploy Skills & Rules') {
				deployWorkspaceAgentIntegration(context);
				vscode.window.showInformationMessage('Deployed in-workspace skills (.agents/skills/todo-tracker/SKILL.md) and rules.');
			} else if (action === 'Register Configs') {
				registerAllMcpConfigs(context);
				deployWorkspaceAgentIntegration(context);
				vscode.window.showInformationMessage('Re-registered MCP configs across workspace and global paths.');
			}
		})
	);

	// Command: Copy MCP Configuration snippet for external tools
	context.subscriptions.push(
		vscode.commands.registerCommand('todo.copyMcpConfig', async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
			const stdioScriptPath = join(context.extensionPath, 'bin', 'todo-mcp.js');

			const stdioConfig = {
				"todo-mcp": {
					"command": "node",
					"args": [
						stdioScriptPath,
						"--workspace",
						workspaceFolder
					]
				}
			};

			const httpConfig = serverUri ? {
				"todo-extension": {
					"url": serverUri.toString()
				}
			} : null;

			const selection = await vscode.window.showQuickPick(
				[
					{
						label: "$(terminal) Stdio Mode (Recommended)",
						description: "Runs on-demand, zero ports, works even when VS Code is closed",
						detail: JSON.stringify(stdioConfig, null, 2),
						value: stdioConfig
					},
					...(httpConfig ? [{
						label: "$(globe) HTTP / SSE Mode",
						description: `Connects to running VS Code instance on ${serverUri?.authority}`,
						detail: JSON.stringify(httpConfig, null, 2),
						value: httpConfig
					}] : [])
				],
				{ placeHolder: "Select MCP configuration format to copy to clipboard" }
			);

			if (selection) {
				await vscode.env.clipboard.writeText(JSON.stringify(selection.value, null, 2));
				vscode.window.showInformationMessage("Copied TODO MCP configuration to clipboard!");
			}
		})
	);

	// Command: Setup AI Agent Rules in workspace (.cursor/rules, AGENTS.md, CLAUDE.md)
	context.subscriptions.push(
		vscode.commands.registerCommand('todo.setupAgentRules', async () => {
			deployWorkspaceAgentIntegration(context);
			vscode.window.showInformationMessage('Successfully deployed in-workspace skills and rules in .agents/skills/todo-tracker, .cursor/rules/todo.mdc, AGENTS.md, and CLAUDE.md!');
		})
	);

	// Debug Command
	context.subscriptions.push(
		vscode.commands.registerCommand('todo.debugMcp', () => {
			const state = {
				hasUri: !!serverUri,
				uri: serverUri?.toString(),
				port: activeMcpServer?.getPort(),
				running: activeMcpServer?.isRunning(),
			};
			McpLogger.log(`Debug State: ${JSON.stringify(state, null, 2)}`);
			vscode.window.showInformationMessage(`MCP Debug: Status ${state.running ? 'RUNNING' : 'STOPPED'} on ${state.uri || 'none'}`);
		})
	);

	context.subscriptions.push(definitionsEmitter, installationsEmitter);

	registerChatParticipant(context, provider);

	const tracker = new HeuristicTracker(provider, context);
	tracker.registerContextMenuCommand();

	context.subscriptions.push(
		vscode.commands.registerCommand('todo.addTask', () => provider.addTaskPrompt()),
		vscode.commands.registerCommand('todo.clearCompleted', () => provider.clearCompleted()),
		vscode.commands.registerCommand('todo.clearActive', () => provider.clearActive()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			deployWorkspaceAgentIntegration(context);
			registerAllMcpConfigs(context);
		}),
		vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('todo.storageScope')) {
				const newStorageScope = vscode.workspace.getConfiguration('todo').get<string>('storageScope', 'file');
				let newState: vscode.Memento;
				if (newStorageScope === 'file') {
					newState = new FileMemento();
				} else {
					newState = newStorageScope === 'workspace' ? context.workspaceState : context.globalState;
				}
				provider.updateStorage(newState);
			}

			if (e.affectsConfiguration('todo.mcp')) {
				await startMcpIfEnabled();
			}
		})
	);
}

export async function deactivate() {
	McpLogger.log('Extension deactivating...');
	if (activeMcpServer) {
		await activeMcpServer.stop();
		activeMcpServer = undefined;
		serverUri = undefined;
	}
	cleanupExternalConfigs();
}
