import * as vscode from 'vscode';

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

class TodoViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'todo.taskList';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _state: vscode.Memento
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'ready':
					this._updateWebview();
					break;
				case 'addTask':
					this.addTask(data.value);
					break;
				case 'toggleTask':
					this.toggleTask(data.id);
					break;
				case 'deleteTask':
					this.deleteTask(data.id);
					break;
				case 'reorderTasks':
					this.reorderTasks(data.tasks);
					break;
				case 'clearCompleted':
					this.clearCompleted();
					break;
				case 'clearActive':
					this.clearActive();
					break;
				case 'checkAll':
					this.checkAll();
					break;
				case 'uncheckAll':
					this.uncheckAll();
					break;
				case 'clearAll':
					this.clearAll();
					break;
				case 'clearCategory':
					this.clearCategory(data.category);
					break;
				case 'moveCategoryToActive':
					this.moveCategoryToActive(data.category);
					break;
				case 'changeCategory':
					this.changeCategory(data.id, data.category);
					break;
				case 'updateTitle':
					this.updateTitle(data.id, data.title);
					break;
			}
		});
	}

	public addTaskPrompt() {
		vscode.window.showInputBox({ prompt: 'Add a new task' }).then(value => {
			if (value) {
				this.addTask(value);
			}
		});
	}

	public async clearCompleted() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => !t.completed);
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async clearActive() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => t.completed);
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async clearAll() {
		const result = await vscode.window.showWarningMessage(
			'Are you sure you want to delete ALL tasks (Active and Completed)?',
			{ modal: true },
			'Delete All'
		);

		if (result === 'Delete All') {
			await this._state.update('tasks', []);
			this._updateWebview([]);
		}
	}

	public async checkAll() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks.forEach(t => t.completed = true);
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async uncheckAll() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks.forEach(t => t.completed = false);
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async clearCategory(category: string) {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => {
			const taskCat = t.category || (t.completed ? 'Completed' : 'Active');
			return taskCat !== category;
		});
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async moveCategoryToActive(category: string) {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks.forEach(t => {
			const taskCat = t.category || (t.completed ? 'Completed' : 'Active');
			if (taskCat === category) {
				t.category = 'Active';
				t.completed = false;
			}
		});
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	private async addTask(title: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		tasks.push({
			id: Date.now().toString(),
			title,
			category: 'Active',
			dueDate: null
		});
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	private async updateTitle(id: string, title: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		const task = tasks.find(t => t.id === id);
		if (task) {
			task.title = title;
			await this._state.update('tasks', tasks);
			this._updateWebview(tasks);
		}
	}

	private async changeCategory(id: string, category: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		const task = tasks.find(t => t.id === id);
		if (task) {
			task.category = category;
			// Keep 'completed' in sync for legacy code/icons if necessary, 
			// though we should eventually fully transition to category.
			task.completed = (category === 'Completed');
			await this._state.update('tasks', tasks);
			this._updateWebview(tasks);
		}
	}

	private async toggleTask(id: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		const task = tasks.find(t => t.id === id);
		if (task) {
			const oldCategory = task.category || (task.completed ? 'Completed' : 'Active');
			if (oldCategory === 'Completed') {
				task.category = 'Active';
				task.completed = false;
			} else {
				task.category = 'Completed';
				task.completed = true;
			}
			await this._state.update('tasks', tasks);
			this._updateWebview(tasks);
		}
	}

	private async deleteTask(id: string) {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => t.id !== id);
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	private async reorderTasks(newTasks: any[]) {
		await this._state.update('tasks', newTasks);
		this._updateWebview(newTasks);
	}

	private _updateWebview(tasks?: any[]) {
		if (this._view) {
			if (!tasks) {
				tasks = this._state.get<any[]>('tasks', []);
			}

			// Migration logic
			let migrated = false;
			tasks.forEach(t => {
				if (t.category === undefined) {
					t.category = t.completed ? 'Completed' : 'Active';
					t.dueDate = t.dueDate || null;
					migrated = true;
				}
			});
			if (migrated) {
				this._state.update('tasks', tasks);
			}

			// Calculate Urgency Counts
			let overdueCount = 0;
			let soonCount = 0;
			const now = new Date();
			now.setHours(0, 0, 0, 0);

			tasks.forEach(t => {
				if (t.dueDate && t.category !== 'Completed') {
					const due = new Date(t.dueDate);
					due.setHours(0, 0, 0, 0);
					const diffTime = due.getTime() - now.getTime();
					const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
					if (diffDays < 0) overdueCount++;
					else if (diffDays <= 3) soonCount++;
				}
			});

			// Badge and Sidebar Icon Tooltip
			const totalUrgent = overdueCount + soonCount;
			const tooltipText = totalUrgent > 0 ? `${overdueCount} Overdue, ${soonCount} Due Soon` : 'Tasks';

			this._view.badge = totalUrgent > 0 ? {
				value: totalUrgent,
				tooltip: tooltipText
			} : undefined;

			// Description on top of the sash (view title area)
			this._view.description = totalUrgent > 0 ? `$(alert) ${overdueCount} $(history) ${soonCount}` : '';

			this._view.webview.postMessage({
				type: 'updateTasks',
				tasks: tasks,
				workspaceName: vscode.workspace.name || 'No Workspace'
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body, html {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        background-color: var(--vscode-sideBar-background);
                    }
                    #infoSection {
                        padding: 8px 12px;
                        background: var(--vscode-sideBarSectionHeader-background);
                        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                        display: flex;
                        flex-direction: row;
                        gap: 4px;
                        flex: 0 0 auto;
                    }
                    .header-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    #workspaceName {
                        font-weight: bold;
                        font-size: 0.9em;
                        text-transform: uppercase;
                        opacity: 0.8;
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-sizing: border-box;
                        margin-right: 4px; 
                        pointer-events: auto;
                    }
                    .input-area {
                        padding: 5px;
                        flex: 0 0 auto;
                    }
                    .input-container {
                        display: flex;
                        gap: 5px;
                    }
                    input[type="text"] {
                        flex: 1;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 5px 10px;
                        outline: 1px solid var(--vscode-input-border);
                    }
                    input[type="text"]:focus {
                        border-color: var(--vscode-focusBorder);
                    }
                    #todoSection, #activeSection, #completedSection, #backlogSection {
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                        flex: 1;
                    }
                    #todoSection.collapsed, #activeSection.collapsed, #completedSection.collapsed, #backlogSection.collapsed {
                        flex: 0 0 auto;
                    }
                    #todoTasks, #activeTasks, #completedTasks, #backlogTasks {
                        flex: 1;
                        overflow-y: auto;
                        padding: 0 10px;
                    }
                    #completedSection, #backlogSection {
                        background: var(--vscode-sideBar-background);
                        border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                    }
                    .task-list {
                        transition: background-color 0.2s;
                    }
                    .task-list.drag-over {
                        background-color: var(--vscode-list-dropBackground, rgba(0, 122, 204, 0.1));
                    }
                    .task-list {
                        list-style: none;
                        padding: 4px 0;
                        margin: 0;
                    }
                    .task-item {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 0 4px;
                        margin-bottom: 2px;
                        border: 1px solid var(--vscode-widget-border, var(--vscode-divider));
                        background: var(--vscode-sideBar-background);
                        transition: all 0.2s;
                        cursor: grab;
                        position: relative;
                        overflow: hidden;
                    }
                    .task-item:hover {
                        border-color: var(--vscode-focusBorder);
                    }
                    .task-item.dragging {
                        opacity: 0.5;
                        background: var(--vscode-list-activeSelectionBackground);
                    }
                    
                    /* Category Theming */
                    .task-item.cat-Active { border-left: 2px solid var(--vscode-charts-blue); }
                    .task-item.cat-Completed { border-left: 2px solid var(--vscode-charts-green); }
                    .task-item.cat-Backlog { border-left: 2px solid var(--vscode-charts-purple); }
                    .task-item.cat-TODO { border-left: 2px solid var(--vscode-descriptionForeground); }

                    .task-title {
                        flex: 1;
                        min-width: 0;
                        font-size: 0.9em;
                        word-break: break-all;
                        white-space: pre-wrap;
                        line-height: 1.4;
                        color: var(--vscode-foreground);
                        padding: 6px 4px;
                        margin-right: 8px;
                    }
                    .task-item.completed .task-title {
                        text-decoration: line-through;
                        opacity: 0.6;
                    }
                    .task-title.editing {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        outline: 1px solid var(--vscode-focusBorder);
                        cursor: text;
                        position: relative;
                        z-index: 20;
                    }

                    /* Due Status Dot */
                    .due-dot {
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        flex-shrink: 0;
                        background: var(--vscode-descriptionForeground);
                    }
                    .due-dot.overdue { background: var(--vscode-errorForeground); box-shadow: 0 0 5px var(--vscode-errorForeground); animation: pulse 2s infinite; }
                    .due-dot.today { background: #ffa500; }
                    .due-dot.soon { background: #ffcc00; }
                    
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.4; }
                        100% { opacity: 1; }
                    }

                    /* Category Switcher (Segmented Control) */
                    .switcher {
                        position: absolute;
                        right: 0;
                        top: 0;
                        bottom: 0;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 0 8px 0 48px;
                        background: linear-gradient(to left, rgba(0, 0, 0, 0.9) 40%, transparent 100%);
                        opacity: 0;
                        transition: opacity 0.2s ease-in-out;
                        pointer-events: none; /* Container is non-blocking */
                        z-index: 10;
                    }
                    .task-item:hover .switcher {
                        opacity: 1;
                    }
                    .switcher-btn {
                        background: transparent;
                        color: #ffffff;
                        border: none;
                        padding: 4px;
                        border-radius: 4px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0.8;
                        transition: all 0.2s;
                        pointer-events: auto; /* Buttons are interactive */
                    }
                    .switcher-btn:hover {
                        opacity: 1;
                        background: rgba(255, 255, 255, 0.15);
                        transform: scale(1.1);
                    }
                    .delete-task-btn:hover {
                        color: var(--vscode-errorForeground, #ff5555);
                        background: rgba(255, 0, 0, 0.2);
                    }
                    .switcher-btn svg {
                        width: 14px;
                        height: 14px;
                    }
                    .delete-task-btn {
                        color: var(--vscode-errorForeground);
                    }
                    .delete-task-btn:hover {
                        background: rgba(255, 0, 0, 0.1);
                    }
                    
                    /* Webview Summary */
                    .summary-bar {
                        display: flex;
                        gap: 12px;
                        padding: 8px 12px;
                        background: var(--vscode-sideBar-background);
                        border-bottom: 1px solid var(--vscode-divider);
                        font-size: 0.85em;
                        opacity: 0.8;
                    }
                    .summary-item {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    .summary-item svg {
                        width: 12px;
                        height: 12px;
                    }
                    .summary-item.Active { color: var(--vscode-charts-blue); }
                    .summary-item.Completed { color: var(--vscode-charts-green); }
                    .summary-item.Backlog { color: var(--vscode-charts-purple); }
                    .section-header {
                        flex: 0 0 auto;
                        background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
                        color: var(--vscode-sideBarSectionHeader-foreground);
                        padding: 6px 10px 6px 4px;
                        font-weight: bold;
                        font-size: 0.85em;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        cursor: pointer;
                        user-select: none;
                    }
                    .section-header:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .header-left {
                        display: flex;
                        align-items: center;
                        gap: 2px;
                    }
                    .chevron {
                        transition: transform 0.1s ease;
                        display: flex;
                    }
                    .collapsed .chevron {
                        transform: rotate(-90deg);
                    }
                    .collapsed .task-list {
                        display: none;
                    }
                    .collapsed .input-area {
                        display: none;
                    }
                    input[type="checkbox"] {
                        cursor: pointer;
                        margin-top: 3px;
                    }
                    .clear-btn {
                        background: transparent;
                        color: var(--vscode-descriptionForeground);
                        border: none;
                        cursor: pointer;
                        padding: 2px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: transform 0.2s;
                    }
                    .clear-btn:hover {
                        transform: scale(1.1);
                        color: var(--vscode-errorForeground);
                    }
                    .clear-btn svg, .icon-btn svg {
                        width: 16px;
                        height: 16px;
                    }
                    .category-icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 14px;
                        height: 14px;
                        margin: 0 4px;
                    }
                    .category-icon svg {
                        width: 14px;
                        height: 14px;
                    }
                    .count-badge {
                        background: var(--vscode-badge-background, #4d4d4d);
                        color: var(--vscode-badge-foreground, #ffffff);
                        padding: 0 6px;
                        border-radius: 10px;
                        font-size: 10px;
                        margin-left: 6px;
                        font-weight: normal;
                        line-height: 14px;
                        height: 14px;
                        display: inline-block;
                        text-transform: none;
                    }
                     .icon-TODO { color: var(--vscode-charts-blue); }
                     .icon-Active { color: var(--vscode-charts-orange); }
                     .icon-Completed { color: var(--vscode-charts-green); }
                     .icon-Backlog { color: var(--vscode-charts-purple); }
                    .icon-btn {
                        background: transparent;
                        color: var(--vscode-foreground);
                        border: none;
                        cursor: pointer;
                        padding: 2px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: transform 0.2s;
                    }
                    .icon-btn:hover {
                        transform: scale(1.1);
                        color: var(--vscode-foreground);
                        background: var(--vscode-toolbar-hoverBackground);
                        opacity: 1;
                    }
                    #infoSection {
                        flex: 0 0 auto;
                        flex-shrink: 0;
                        background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
                        padding: 6px 10px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                        min-height: 28px;
                        z-index: 10;
                    }
                    #workspaceName {
                        font-weight: bold;
                        font-size: 0.85em;
                        color: var(--vscode-sideBarSectionHeader-foreground);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                    }
                    .action-buttons {
                        display: flex;
                        gap: 4px;
                        flex-shrink: 0;
                    }
                    .test-area {
                        padding: 4px 10px;
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                        background: rgba(255, 255, 255, 0.05);
                        border-bottom: 1px solid var(--vscode-divider);
                    }
                    /* Custom Instant Tooltip */
                    .custom-tooltip {
                        position: fixed;
                        background: var(--vscode-editorHoverWidget-background, #252526);
                        color: var(--vscode-editorHoverWidget-foreground, #cccccc);
                        border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
                        padding: 4px 10px;
                        border-radius: 4px;
                        font-size: 11px;
                        z-index: 1000;
                        pointer-events: none;
                        display: none;
                        white-space: nowrap;
                        box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.4));
                    }
                    .custom-tooltip::after {
                        content: '';
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        margin-left: -5px;
                        border-width: 5px;
                        border-style: solid;
                        border-color: transparent transparent var(--vscode-editorHoverWidget-border, #454545) transparent;
                    }
                    .custom-tooltip::before {
                        content: '';
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        margin-left: -4px;
                        border-width: 4px;
                        border-style: solid;
                        border-color: transparent transparent var(--vscode-editorHoverWidget-background, #252526) transparent;
                        z-index: 1001;
                    }
                    .custom-tooltip.top-pointer::after, .custom-tooltip.top-pointer::before {
                        bottom: auto;
                        top: 100%;
                    }
                    .custom-tooltip.top-pointer::after {
                        border-color: var(--vscode-editorHoverWidget-border, #454545) transparent transparent transparent;
                    }
                    .custom-tooltip.top-pointer::before {
                        border-color: var(--vscode-editorHoverWidget-background, #252526) transparent transparent transparent;
                    }
                    .custom-tooltip::after, .custom-tooltip::before {
                        left: var(--pointer-left, 50%);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div id="infoSection">
                        <div class="header-row">
                            <span id="workspaceName">Loading Workspace...</span>
                        </div>
                        <div class="action-buttons">
                            <button class="icon-btn" onclick="clearAll()" data-tooltip="Delete All Tasks">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 0 0 1 2-2h4a2 0 0 1 2 2v2"/></svg>
                            </button>
                            </div>
                    </div>
                    <div id="todoSection">
                         <div class="section-header" onclick="toggleSection('todoSection')">
                             <div class="header-left">
                                 <div class="chevron">
                                     <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.62.618L8.285 11l-.309.309L7.667 11 2.714 6.333l.619-.618 4.643 4.357z"/></svg>
                                 </div>
								 <div class="category-icon icon-TODO" id="todoHeaderIcon">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
                                 </div>
								 <span>TODO</span>
                                 <span class="count-badge" id="todoHeaderCount">0</span>
                             </div>
                             <div class="action-buttons" onclick="event.stopPropagation()">
                                 <button class="icon-btn" onclick="activateAllTodo()" data-tooltip="Activate All TODO">
                                     <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        >
                                        <path d="M21 5H3"/><path d="M10 12H3"/><path d="M10 19H3"/><path d="M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z"/>
                                    </svg>
                                 </button>
                                 <button class="clear-btn" onclick="clearTodo()" data-tooltip="Delete TODO">
                                     <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        >
                                        <path d="M11 12H3" />
                                        <path d="M11 19H3" />
                                        <path d="m15.5 13.5 5 5" />
                                        <path d="m20.5 13.5-5 5" />
                                        <path d="M21 5H3" />
                                    </svg>
                                 </button>
                             </div>
                         </div>
                        <div id="todoTasks" class="task-list"></div>
                    </div>
                    <div id="activeSection">
                        <div class="section-header" onclick="toggleSection('activeSection')">
                            <div class="header-left">
                                <div class="chevron">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.62.618L8.285 11l-.309.309L7.667 11 2.714 6.333l.619-.618 4.643 4.357z"/></svg>
                                </div>
								<div class="category-icon icon-Active" id="activeHeaderIcon">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                </div>	
                                <span>Active Tasks</span>

                                <span class="count-badge" id="activeHeaderCount">0</span>
                            </div>
                            <div class="action-buttons" onclick="event.stopPropagation()">
                                <button class="clear-btn" onclick="clearActive()" data-tooltip="Delete Active">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        >
                                        <path d="M11 12H3" />
                                        <path d="M11 19H3" />
                                        <path d="m15.5 13.5 5 5" />
                                        <path d="m20.5 13.5-5 5" />
                                        <path d="M21 5H3" />
                                    </svg>
                                </button>

                                <button class="icon-btn" onclick="checkAll()" data-tooltip="Check All">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="input-area">
                            <div class="input-container">
                                <input type="text" id="taskInput" placeholder="Add a task, press Enter..." autofocus />
                            </div>
                        </div>
                        <div id="activeTasks" class="task-list"></div>
                    </div>
					
                    <div id="completedSection">
                        <div class="section-header" onclick="toggleSection('completedSection')">
                            <div class="header-left">
                                <div class="chevron">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.62.618L8.285 11l-.309.309L7.667 11 2.714 6.333l.619-.618 4.643 4.357z"/></svg>
                                </div>
                                <div class="category-icon icon-Completed" id="completedHeaderIcon">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                </div>
                                <span>Completed</span>
                                <span class="count-badge" id="completedHeaderCount">0</span>
                            </div>
                            <div class="action-buttons" onclick="event.stopPropagation()">
                                <button class="clear-btn" onclick="clearCompleted()" data-tooltip="Delete Completed">
                                   <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    >
                                        <path d="M11 12H3" />
                                        <path d="M11 19H3" />
                                        <path d="m15.5 13.5 5 5" />
                                        <path d="m20.5 13.5-5 5" />
                                        <path d="M21 5H3" />
                                    </svg>
                                </button>
                                <button class="icon-btn" onclick="uncheckAll()" data-tooltip="Uncheck All">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
                                </button>
                            </div>
                        </div>
						
                        <div id="completedTasks" class="task-list"></div>

                    </div>
                    <div id="backlogSection">
                        <div class="section-header" onclick="toggleSection('backlogSection')">
                            <div class="header-left">
                                <div class="chevron">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.62.618L8.285 11l-.309.309L7.667 11 2.714 6.333l.619-.618 4.643 4.357z"/></svg>
                                </div>
                                <div class="category-icon icon-Backlog" id="backlogHeaderIcon">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                                </div>
                                <span>Backlog</span>
                                 <span class="count-badge" id="backlogHeaderCount">0</span>
                             </div>
                             <div class="action-buttons" onclick="event.stopPropagation()">
                                 <button class="clear-btn" onclick="clearBacklog()" data-tooltip="Delete Backlog">
                                     <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        >
                                        <path d="M11 12H3" />
                                        <path d="M11 19H3" />
                                        <path d="m15.5 13.5 5 5" />
                                        <path d="m20.5 13.5-5 5" />
                                        <path d="M21 5H3" />
                                    </svg>
                                 </button>
                             </div>
                         </div>
                        <div id="backlogTasks" class="task-list"></div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const input = document.getElementById('taskInput');
                    const todoList = document.getElementById('todoTasks');
                    const todoSection = document.getElementById('todoSection');
                    const activeList = document.getElementById('activeTasks');
                    const activeSection = document.getElementById('activeSection');
                    const completedList = document.getElementById('completedTasks');
                    const completedSection = document.getElementById('completedSection');
                    const backlogList = document.getElementById('backlogTasks');
                    const backlogSection = document.getElementById('backlogSection');
                    const workspaceNameEl = document.getElementById('workspaceName');

                    const categoryIcons = {
                        TODO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>',
                        Active: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
                        Completed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
                        Backlog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>'
                    };

                    // Set up context drop zones
                    [
                        { el: todoList, cat: 'TODO' },
                        { el: activeList, cat: 'Active' },
                        { el: completedList, cat: 'Completed' },
                        { el: backlogList, cat: 'Backlog' }
                    ].forEach(zone => {
                        zone.el.addEventListener('dragover', (e) => {
                            handleDragOver(e);
                            zone.el.classList.add('drag-over');
                        });
                        zone.el.addEventListener('dragleave', () => {
                            zone.el.classList.remove('drag-over');
                        });
                        zone.el.addEventListener('drop', (e) => {
                            zone.el.classList.remove('drag-over');
                            if (e.target === zone.el) {
                                handleSectionDrop(e, zone.cat);
                            }
                        });
                    });
 
                    // Tooltip Logic
                    const tooltipEl = document.createElement('div');
                    tooltipEl.className = 'custom-tooltip';
                    document.body.appendChild(tooltipEl);
 
                    document.addEventListener('mouseover', e => {
                        const target = e.target.closest('[data-tooltip]');
                        if (target) {
                            tooltipEl.innerHTML = target.getAttribute('data-tooltip');
                            tooltipEl.style.display = 'block';
                            
                            const rect = target.getBoundingClientRect();
                            const tooltipRect = tooltipEl.getBoundingClientRect();
                            
                            // Position below the element, centered
                            let top = rect.bottom + 8;
                            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                            
                            // Safety checks for viewport edges
                            if (left < 6) left = 6;
                            if (left + tooltipRect.width > window.innerWidth - 6) {
                                left = window.innerWidth - tooltipRect.width - 6;
                            }
                            
                            // Adjust pointer (arrow) position to stay centered under the button
                            const pointerOffset = (rect.left + rect.width / 2) - left;
                            tooltipEl.style.setProperty('--pointer-left', pointerOffset + 'px');
                            
                            if (top + tooltipRect.height > window.innerHeight) {
                                top = rect.top - tooltipRect.height - 8;
                                tooltipEl.classList.add('top-pointer');
                            } else {
                                tooltipEl.classList.remove('top-pointer');
                            }
                            
                            tooltipEl.style.top = top + 'px';
                            tooltipEl.style.left = left + 'px';
                        }
                    });
 
                    document.addEventListener('mouseout', e => {
                        if (e.target.closest('[data-tooltip]')) {
                            tooltipEl.style.display = 'none';
                        }
                    });

                    const previousState = vscode.getState();
                    let currentTasks = previousState ? previousState.tasks : [];
                    let collapsedStates = previousState ? (previousState.collapsedStates || {}) : {};

                    // Restore folding states
                    Object.keys(collapsedStates).forEach(id => {
                        if (collapsedStates[id]) {
                            document.getElementById(id).classList.add('collapsed');
                        }
                    });

                    function toggleSection(id) {
                        const el = document.getElementById(id);
                        const isCollapsed = el.classList.toggle('collapsed');
                        collapsedStates[id] = isCollapsed;
                        vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates });
                    }
                    if (previousState && previousState.workspaceName) {
                        workspaceNameEl.textContent = previousState.workspaceName;
                    }
                    if (currentTasks.length > 0) {
                        renderTasks(currentTasks);
                    }

                    vscode.postMessage({ type: 'ready' });

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && input.value.trim()) {
                            vscode.postMessage({ type: 'addTask', value: input.value.trim() });
                            input.value = '';
                        }
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'updateTasks') {
                            currentTasks = message.tasks;
                            if (message.workspaceName) {
                                workspaceNameEl.textContent = message.workspaceName;
                            }
                            
                            vscode.setState({ tasks: currentTasks, workspaceName: message.workspaceName, collapsedStates });
                            renderTasks(currentTasks);
                        }
                    });

                      function renderTasks(tasks) {
                        todoList.innerHTML = '';
                        activeList.innerHTML = '';
                        completedList.innerHTML = '';
                        backlogList.innerHTML = '';

                        let counts = { TODO: 0, Active: 0, Completed: 0, Backlog: 0 };

                        tasks.forEach((task, index) => {
                            const category = task.category || 'Active';
                            counts[category]++;

                            const li = document.createElement('div');
                            li.className = \`task-item cat-\${category}\` + (category === 'Completed' ? ' completed' : '');
                            li.draggable = true;
                            li.dataset.id = task.id;
                            li.dataset.index = index;

                            const dueStatus = getDueStatus(task.dueDate);
                            const dueDateStr = formatDueDate(task.dueDate, dueStatus);
                            li.setAttribute('data-tooltip', dueDateStr);

                            let switcherHtml = '';
                            Object.keys(categoryIcons).forEach(cat => {
                                if (cat !== category) {
                                    switcherHtml += \`
                                        <button class="switcher-btn" data-tooltip="Mark as \${cat}" onclick="event.stopPropagation(); changeCategory('\${task.id}', '\${cat}')">
                                            \${categoryIcons[cat]}
                                        </button>
                                    \`;
                                }
                            });

                            li.innerHTML = \`
                                <div class="due-dot \${dueStatus}"></div>
                                <span class="task-title">\${escapeHtml(task.title)}</span>
                                <div class="switcher">
                                    \${switcherHtml}
                                    <button class="switcher-btn delete-task-btn" data-tooltip="Delete Task" onclick="event.stopPropagation(); deleteTask('\${task.id}')">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    </button>
                                </div>
                            \`;

                            li.addEventListener('dblclick', (e) => {
                                if (e.target.closest('.switcher')) return;
                                const titleEl = li.querySelector('.task-title');
                                if (titleEl.classList.contains('editing')) return;

                                titleEl.contentEditable = 'true';
                                titleEl.focus();
                                titleEl.classList.add('editing');
                                document.execCommand('selectAll', false, null);

                                function finishEdit() {
                                    titleEl.contentEditable = 'false';
                                    titleEl.classList.remove('editing');
                                    const newTitle = titleEl.innerText.trim();
                                    if (newTitle && newTitle !== task.title) {
                                        vscode.postMessage({ type: 'updateTitle', id: task.id, title: newTitle });
                                    } else {
                                        titleEl.innerText = task.title;
                                    }
                                }

                                titleEl.addEventListener('blur', finishEdit, { once: true });
                                titleEl.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        titleEl.blur();
                                    }
                                    if (e.key === 'Escape') {
                                        titleEl.innerText = task.title;
                                        titleEl.blur();
                                    }
                                });
                            });

                            li.addEventListener('dragstart', handleDragStart);
                            li.addEventListener('dragover', handleDragOver);
                            li.addEventListener('drop', handleDrop);
                            li.addEventListener('dragend', handleDragEnd);

                            if (category === 'TODO') todoList.appendChild(li);
                            else if (category === 'Active') activeList.appendChild(li);
                            else if (category === 'Completed') completedList.appendChild(li);
                            else if (category === 'Backlog') backlogList.appendChild(li);
                        });

                        // Update Header Icons and Counts
                        Object.keys(counts).forEach(cat => {
                            const iconEl = document.getElementById(cat.toLowerCase() + 'HeaderIcon');
                            const countEl = document.getElementById(cat.toLowerCase() + 'HeaderCount');
                            if (iconEl) iconEl.innerHTML = categoryIcons[cat];
                            if (countEl) countEl.textContent = counts[cat];
                        });
                    }

                    function getDueStatus(dueDate) {
                        if (!dueDate) return 'none';
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const due = new Date(dueDate);
                        due.setHours(0, 0, 0, 0);
                        const diffTime = due.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays < 0) return 'overdue';
                        if (diffDays === 0) return 'today';
                        if (diffDays <= 3) return 'soon';
                        return 'normal';
                    }

                    function formatDueDate(dueDate, status) {
                        if (!dueDate) return 'No due date';
                        const due = new Date(dueDate);
                        if (status === 'overdue') return 'Overdue';
                        if (status === 'today') return 'Due Today';
                        if (status === 'soon') return 'Due Soon';
                        return 'Due ' + due.toLocaleDateString();
                    }

                    function changeCategory(id, category) {
                        vscode.postMessage({ type: 'changeCategory', id, category });
                    }

                    let dragSourceEl = null;

                    function handleDragStart(e) {
                        if (e.target.closest('.task-title.editing')) {
                            e.preventDefault();
                            return;
                        }
                        dragSourceEl = this;
                        e.dataTransfer.effectAllowed = 'move';
                        this.classList.add('dragging');
                        e.dataTransfer.setData('text/plain', this.dataset.id);
                    }

                    function handleDragOver(e) {
                        if (e.preventDefault) {
                            e.preventDefault();
                        }
                        e.dataTransfer.dropEffect = 'move';
                        return false;
                    }

                    function handleDrop(e) {
                        e.stopPropagation();
                        e.preventDefault();

                        if (dragSourceEl && dragSourceEl !== this) {
                            const sourceId = dragSourceEl.dataset.id;
                            const targetId = this.dataset.id;
                            
                            // Determine target category from the item's classes
                            const targetCategory = Array.from(this.classList)
                                .find(c => c.startsWith('cat-'))
                                ?.replace('cat-', '') || 'Active';
                            
                            const sourceIndex = currentTasks.findIndex(t => t.id === sourceId);
                            const targetIndex = currentTasks.findIndex(t => t.id === targetId);
                            
                            if (sourceIndex !== -1 && targetIndex !== -1) {
                                const newTasks = [...currentTasks];
                                const [movedTask] = newTasks.splice(sourceIndex, 1);
                                
                                // Update category
                                movedTask.category = targetCategory;
                                movedTask.completed = (targetCategory === 'Completed');
                                
                                // We need to re-splice based on the new index after the first splice
                                const finalTargetIndex = newTasks.findIndex(t => t.id === targetId);
                                newTasks.splice(finalTargetIndex, 0, movedTask);
                                
                                currentTasks = newTasks;
                                vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates });
                                renderTasks(newTasks);
                                vscode.postMessage({ type: 'reorderTasks', tasks: newTasks });
                            }
                        }
                        return false;
                    }

                    function handleSectionDrop(e, targetCategory) {
                        e.preventDefault();
                        if (dragSourceEl) {
                            const sourceId = dragSourceEl.dataset.id;
                            const sourceIndex = currentTasks.findIndex(t => t.id === sourceId);
                            
                            if (sourceIndex !== -1) {
                                const newTasks = [...currentTasks];
                                const [movedTask] = newTasks.splice(sourceIndex, 1);
                                
                                movedTask.category = targetCategory;
                                movedTask.completed = (targetCategory === 'Completed');
                                
                                // Insert at the end of this category's block or just at the end of the array
                                // Since renderTasks just appends to the correct list, the array order 
                                // determines relative order within the list.
                                newTasks.push(movedTask);
                                
                                currentTasks = newTasks;
                                vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates });
                                renderTasks(newTasks);
                                vscode.postMessage({ type: 'reorderTasks', tasks: newTasks });
                            }
                        }
                    }

                    function handleDragEnd() {
                        if (dragSourceEl) {
                            dragSourceEl.classList.remove('dragging');
                            dragSourceEl = null;
                        }
                    }

                    window.addEventListener('mouseup', () => {
                        handleDragEnd();
                    });

                    function toggleTask(id) {
                        vscode.postMessage({ type: 'toggleTask', id });
                    }

                    function deleteTask(id) {
                        vscode.postMessage({ type: 'deleteTask', id });
                    }

                    function clearCompleted() {
                        vscode.postMessage({ type: 'clearCompleted' });
                    }

                     function clearActive() {
                        vscode.postMessage({ type: 'clearActive' });
                    }

                     function clearTodo() {
                        vscode.postMessage({ type: 'clearCategory', category: 'TODO' });
                    }

                    function activateAllTodo() {
                        vscode.postMessage({ type: 'moveCategoryToActive', category: 'TODO' });
                    }

                    function clearBacklog() {
                        vscode.postMessage({ type: 'clearCategory', category: 'Backlog' });
                    }

                    function clearCategory(category) {
                        vscode.postMessage({ type: 'clearCategory', category: category });
                    }

                    function checkAll() {
                        vscode.postMessage({ type: 'checkAll' });
                    }

                    function uncheckAll() {
                        vscode.postMessage({ type: 'uncheckAll' });
                    }

                    function clearAll() {
                        console.log('clearAll called');
                        vscode.postMessage({ type: 'clearAll' });
                    }

                    function escapeHtml(text) {
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
                    }
                </script>
            </body>
            </html>`;
	}
}
