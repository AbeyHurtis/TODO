import * as vscode from 'vscode';
import { ICONS } from './icons';

export class TodoViewProvider implements vscode.WebviewViewProvider {
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
					this.addTask(data.value, data.dueDate, data.category || 'TODO', data.id);
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
		tasks = tasks.filter(t => {
			const isCompleted = t.category === 'Completed' || t.completed === true;
			return !isCompleted;
		});
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async clearActive() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => {
			const isCompleted = t.category === 'Completed' || t.completed === true;
			const isBacklog = t.category === 'Backlog';
			return isCompleted || isBacklog;
		});
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
		tasks.forEach(t => {
			t.completed = true;
			t.category = 'Completed';
		});
		await this._state.update('tasks', tasks);
		this._updateWebview(tasks);
	}

	public async uncheckAll() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks.forEach(t => {
			t.completed = false;
			if (t.category === 'Completed') {
				t.category = 'Active';
			}
		});
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

	public async addTask(title: string, dueDate: string | null = null, category: string = 'TODO', id?: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		tasks.push({
			id: id || Date.now().toString(),
			title,
			category,
			dueDate
		});
		const sortedTasks = this._sortTasks(tasks);
		await this._state.update('tasks', sortedTasks);
		this._updateWebview(sortedTasks);
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

	public getTasks(): any[] {
		return this._state.get<any[]>('tasks', []);
	}

	public async changeCategory(id: string, category: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		const task = tasks.find(t => t.id === id);
		if (task) {
			task.category = category;
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

	private _sortTasks(tasks: any[]): any[] {
		// Use a stable sort to maintain relative order for same/no dates
		return tasks.sort((a, b) => {
			const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
			const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
			
			if (dateA !== dateB) {
				return dateA - dateB;
			}
			return 0; // Maintain relative order if dates are same
		});
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
			let overdueCount = 0;
			let soonCount = 0;
			const now = new Date();
			now.setHours(0, 0, 0, 0);

			tasks.forEach(t => {
				const category = String(t.category || (t.completed ? 'Completed' : 'Active'));
				const isCompleted = category === 'Completed' || !!t.completed;
				const isBacklog = category === 'Backlog';
				const isBlocked = category === 'Blocked';

				if (t.dueDate && !isCompleted && !isBacklog && !isBlocked) {
					const due = new Date(t.dueDate);
					if (isNaN(due.getTime())) return;

					due.setHours(0, 0, 0, 0);
					const diffTime = due.getTime() - now.getTime();
					const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

					if (diffDays < 0) overdueCount++;
					else if (diffDays <= 3) soonCount++;
				}
			});

			const totalUrgent = overdueCount + soonCount;
			const tooltipText = totalUrgent > 0 ? `${overdueCount} Overdue, ${soonCount} Due Soon` : 'Tasks';

			if (totalUrgent === 0) {
				this._view.badge = undefined;
				this._view.description = '';
			} else {
				this._view.badge = {
					value: totalUrgent,
					tooltip: tooltipText
				};
				this._view.description = `$(alert) ${overdueCount} $(history) ${soonCount}`;
			}

			this._view.webview.postMessage({
				type: 'updateTasks',
				tasks: tasks,
				workspaceName: vscode.workspace.name || 'No Workspace'
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));

		return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
            </head>
            <body>
                <div class="container">
                    <div id="infoSection">
                        <div class="header-row">
                            <span id="workspaceName">Loading Workspace...</span>
                        </div>
                        <div class="action-buttons">
						<button class="clear-btn" onclick="clearAll()" data-tooltip="Delete All Tasks">
							${ICONS.DELETE_CATEGORY}
						</button>
                            <button class="icon-btn" onclick="toggleCleanView()" data-tooltip="Clean View (Hide Empty)">
                                ${ICONS.CLEAN_VIEW}
                            </button>
                        </div>
                    </div>
                    <div class="input-area">
                        <div class="input-container">
                            <textarea id="taskInput" placeholder="Add a task, press Enter..." rows="1"></textarea>
                            
                            <label class="date-wrapper" id="dateWrapper" data-tooltip="Set Due Date">
								<span class="calander-icon"></span>
								<input class="date-input" type="date" id="dueDateInput" />
                            </label>

                        </div>
                    </div>
                    ${this._getSectionHtml('todo', 'TODO', ICONS.TODO, `
                        <button class="clear-btn" onclick="clearTodo()" data-tooltip="Delete TODO">${ICONS.DELETE_CATEGORY}</button>
                        <button class="icon-btn" onclick="activateAllTodo()" data-tooltip="Activate All TODO">${ICONS.ACTIVATE_ALL}</button>
                    `)}
                    ${this._getSectionHtml('active', 'Active Tasks', ICONS.ACTIVE, `
                        <button class="clear-btn" onclick="clearActive()" data-tooltip="Delete Active">${ICONS.DELETE_CATEGORY}</button>
                        <button class="icon-btn" onclick="checkAll()" data-tooltip="Check All">${ICONS.CHECK_ALL}</button>
                    `)}
                    ${this._getSectionHtml('completed', 'Completed', ICONS.COMPLETED, `
                        <button class="clear-btn" onclick="clearCompleted()" data-tooltip="Delete Completed">${ICONS.DELETE_CATEGORY}</button>
                        <button class="icon-btn" onclick="uncheckAll()" data-tooltip="Uncheck All">${ICONS.UNCHECK_ALL}</button>
                    `)}
                    ${this._getSectionHtml('backlog', 'Backlog', ICONS.BACKLOG, `
                        <button class="clear-btn" onclick="clearBacklog()" data-tooltip="Delete Backlog">${ICONS.DELETE_CATEGORY}</button>
                    `)}
                    ${this._getSectionHtml('blocked', 'Blocked', ICONS.BLOCKED, `
                        <button class="clear-btn" onclick="clearBlocked()" data-tooltip="Delete Blocked">${ICONS.DELETE_CATEGORY}</button>
                    `)}
                </div>

                <script>
                    const ICONS = ${JSON.stringify(ICONS)};
                </script>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
	}

	private _getSectionHtml(id: string, title: string, icon: string, buttons: string) {
		return `
            <div id="${id}Section">
                <div class="section-header" onclick="toggleSection('${id}Section')">
                    <div class="header-left">
                        <div class="chevron">${ICONS.CHEVRON}</div>
                        <div class="category-icon icon-${id === 'todo' ? 'TODO' : id.charAt(0).toUpperCase() + id.slice(1)}" id="${id}HeaderIcon">${icon}</div>
                        <span>${title}</span>
                        <span class="count-badge" id="${id}HeaderCount">0</span>
                    </div>
                    <div class="action-buttons" onclick="event.stopPropagation()">
                        ${buttons}
                    </div>
                </div>
                <div id="${id}Tasks" class="task-list"></div>
            </div>
        `;
	}
}

