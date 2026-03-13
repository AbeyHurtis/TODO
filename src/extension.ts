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

	public clearCompleted() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => !t.completed);
		this._state.update('tasks', tasks);
		this._updateWebview();
	}

	public clearActive() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => t.completed);
		this._state.update('tasks', tasks);
		this._updateWebview();
	}

	public async clearAll() {
		const result = await vscode.window.showWarningMessage(
			'Are you sure you want to delete ALL tasks (Active and Completed)?',
			{ modal: true },
			'Delete All'
		);

		if (result === 'Delete All') {
			this._state.update('tasks', []);
			this._updateWebview();
		}
	}

	public checkAll() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks.forEach(t => t.completed = true);
		this._state.update('tasks', tasks);
		this._updateWebview();
	}

	public uncheckAll() {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks.forEach(t => t.completed = false);
		this._state.update('tasks', tasks);
		this._updateWebview();
	}

	private addTask(title: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		tasks.push({ id: Date.now().toString(), title, completed: false });
		this._state.update('tasks', tasks);
		this._updateWebview();
	}

	private toggleTask(id: string) {
		const tasks = this._state.get<any[]>('tasks', []);
		const task = tasks.find(t => t.id === id);
		if (task) {
			task.completed = !task.completed;
			this._state.update('tasks', tasks);
			this._updateWebview();
		}
	}

	private deleteTask(id: string) {
		let tasks = this._state.get<any[]>('tasks', []);
		tasks = tasks.filter(t => t.id !== id);
		this._state.update('tasks', tasks);
		this._updateWebview();
	}

	private reorderTasks(newTasks: any[]) {
		this._state.update('tasks', newTasks);
	}

	private _updateWebview() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'updateTasks',
				tasks: this._state.get('tasks', []),
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
                    #activeSection, #completedSection {
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                        flex: 1; /* Both share space when expanded */
                    }
                    #activeSection.collapsed, #completedSection.collapsed {
                        flex: 0 0 auto;
                    }
                    #activeTasks, #completedTasks {
                        flex: 1;
                        overflow-y: auto;
                        padding: 0 10px;
                    }
                    #completedSection {
                        background: var(--vscode-sideBar-background);
                        border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                    }
                    .task-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }
                    .task-item {
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        padding: 8px 4px;
                        border-bottom: 1px solid var(--vscode-divider);
                        cursor: grab;
                        user-select: none;
                    }
                    .task-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .task-item.dragging {
                        opacity: 0.5;
                        background: var(--vscode-list-activeSelectionBackground);
                    }
                    .task-item.completed .task-title {
                        text-decoration: line-through;
                        opacity: 0.6;
                    }
                    .task-title {
                        flex: 1;
                        word-break: break-all;
                        white-space: pre-wrap;
                        line-height: 1.4;
                    }
                    .delete-btn {
                        background: transparent;
                        color: var(--vscode-Foreground);
                        padding: 0 5px;
                        font-size: 1.2em;
                        border: none;
                        cursor: pointer;
                        opacity: 0;
                        transition: opacity 0.2s;
                    }
                    .task-item:hover .delete-btn {
                        opacity: 1;
                    }
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
                        <span id="workspaceName">Loading Workspace...</span>
                        <div class="action-buttons">
                            <button class="icon-btn" onclick="clearAll()" data-tooltip="Delete All">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                    <div id="activeSection">
                        <div class="section-header" onclick="toggleSection('activeSection')">
                            <div class="header-left">
                                <div class="chevron">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.62.618L8.285 11l-.309.309L7.667 11 2.714 6.333l.619-.618 4.643 4.357z"/></svg>
                                </div>
                                <span>Active Tasks</span>
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
                                <span>Completed</span>
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
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const input = document.getElementById('taskInput');
                    const activeList = document.getElementById('activeTasks');
                    const activeSection = document.getElementById('activeSection');
                    const completedList = document.getElementById('completedTasks');
                    const completedSection = document.getElementById('completedSection');
                    const workspaceNameEl = document.getElementById('workspaceName');

                    // Tooltip Logic
                    const tooltipEl = document.createElement('div');
                    tooltipEl.className = 'custom-tooltip';
                    document.body.appendChild(tooltipEl);

                    document.addEventListener('mouseover', e => {
                        const target = e.target.closest('[data-tooltip]');
                        if (target) {
                            tooltipEl.textContent = target.getAttribute('data-tooltip');
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
                        activeList.innerHTML = '';
                        completedList.innerHTML = '';
    
                        let hasCompleted = false;
                        let hasActive = false;

                        tasks.forEach((task, index) => {
                            const li = document.createElement('div');
                            li.className = 'task-item' + (task.completed ? ' completed' : '');
                            li.draggable = true;
                            li.dataset.id = task.id;
                            li.dataset.index = index;
                            
                            li.innerHTML = \`
                                <input type="checkbox" \${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); toggleTask('\${task.id}')" />
                                <span class="task-title">\${escapeHtml(task.title)}</span>
                                <button class="delete-btn" onclick="event.stopPropagation(); deleteTask('\${task.id}')" title="Delete task">×</button>
                            \`;

                            li.addEventListener('dragstart', handleDragStart);
                            li.addEventListener('dragover', handleDragOver);
                            li.addEventListener('drop', handleDrop);
                            li.addEventListener('dragend', handleDragEnd);

                            if (task.completed) {
                                completedList.appendChild(li);
                                hasCompleted = true;
                            } else {
                                activeList.appendChild(li);
                                hasActive = true;
                            }
                        });
    
                    }

                    let dragSourceEl = null;

                    function handleDragStart(e) {
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
                            const sourceIndex = parseInt(dragSourceEl.dataset.index);
                            const targetIndex = parseInt(this.dataset.index);
                            
                            const newTasks = [...currentTasks];
                            const [movedTask] = newTasks.splice(sourceIndex, 1);
                            newTasks.splice(targetIndex, 0, movedTask);
                            
                            currentTasks = newTasks;
                            vscode.setState({ tasks: currentTasks });
                            renderTasks(newTasks);
                            vscode.postMessage({ type: 'reorderTasks', tasks: newTasks });
                        }
                        return false;
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
