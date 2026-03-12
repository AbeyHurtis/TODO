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
    ) {}

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
                        /* CRITICAL: Allow clicks to pass through to VS Code's sash if they are on the very edge */
                        pointer-events: none;
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        box-sizing: border-box;
                        /* Give the sash a small 'interaction zone' that the webview won't intercept */
                        margin-right: 4px; 
                        pointer-events: auto;
                    }
                    .input-area {
                        padding: 10px;
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
                        padding: 6px 10px;
                        outline: none;
                    }
                    input[type="text"]:focus {
                        border-color: var(--vscode-focusBorder);
                    }
                    #activeSection {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                    }
                    #activeTasks {
                        flex: 1;
                        overflow-y: auto;
                        padding: 0 10px;
                    }
                    #completedSection {
                        flex: 0 0 25%;
                        display: flex;
                        flex-direction: column;
                        min-height: 50px;
                        background: var(--vscode-sideBar-background);
                        border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                    }
                    #completedTasks {
                        flex: 1;
                        overflow-y: auto;
                        padding: 0 10px;
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
                        color: var(--vscode-errorForeground);
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
                        padding: 6px 10px;
                        font-weight: bold;
                        font-size: 0.85em;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
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
                        font-size: 0.8em;
                        padding: 2px 6px;
                        border-radius: 3px;
                    }
                    .clear-btn:hover {
                        background: var(--vscode-toolbar-hoverBackground);
                        color: var(--vscode-foreground);
                    }
                    #infoSection {
                        flex: 0 0 auto;
                        background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
                        padding: 8px 10px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-divider));
                        min-height: 32px;
                    }
                    #workspaceName {
                        font-weight: bold;
                        font-size: 0.85em;
                        color: var(--vscode-sideBarSectionHeader-foreground);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        margin-right: 10px;
                    }
                    .action-buttons {
                        display: flex;
                        gap: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="input-area">
                        <div class="input-container">
                            <input type="text" id="taskInput" placeholder="Add a task, press Enter..." autofocus />
                        </div>
                    </div>
                    <div id="infoSection">
                        <span id="workspaceName">Loading...</span>
                        <div class="action-buttons">
                            <button class="clear-btn" onclick="clearActive()" title="Clear all active tasks">Clear Active</button>
                            <button class="clear-btn" onclick="clearCompleted()" title="Clear all completed tasks">Clear Completed</button>
                        </div>
                    </div>
                    <div id="activeSection">
                        <div class="section-header">
                            <span>Active Tasks</span>
                        </div>
                        <div id="activeTasks" class="task-list"></div>
                    </div>
                    <div id="completedSection" style="display: none;">
                        <div class="section-header">
                            <span>Completed Tasks</span>
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

                    const previousState = vscode.getState();
                    let currentTasks = previousState ? previousState.tasks : [];
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
                            vscode.setState({ tasks: currentTasks, workspaceName: message.workspaceName });
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
    
                        activeSection.style.display = hasActive ? 'flex' : 'none';
                        completedSection.style.display = hasCompleted ? 'flex' : 'none';
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
