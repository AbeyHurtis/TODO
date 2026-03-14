const vscode = acquireVsCodeApi();
const input = document.getElementById('taskInput');
const dateInput = document.getElementById('dueDateInput');
const dateWrapper = document.getElementById('dateWrapper');
const todoList = document.getElementById('todoTasks');
const todoSection = document.getElementById('todoSection');
const activeList = document.getElementById('activeTasks');
const activeSection = document.getElementById('activeSection');
const completedList = document.getElementById('completedTasks');
const completedSection = document.getElementById('completedSection');
const backlogList = document.getElementById('backlogTasks');
const backlogSection = document.getElementById('backlogSection');
const blockedList = document.getElementById('blockedTasks');
const blockedSection = document.getElementById('blockedSection');
const workspaceNameEl = document.getElementById('workspaceName');
const previousState = vscode.getState();
let currentTasks = previousState ? previousState.tasks : [];
let collapsedStates = previousState ? (previousState.collapsedStates || {}) : {};
let lastAddedTaskId = null;
let isCleanView = previousState ? (previousState.isCleanView || false) : false;

const categoryIcons = {
    TODO: ICONS.TODO,
    Active: ICONS.ACTIVE,
    Completed: ICONS.COMPLETED,
    Backlog: ICONS.BACKLOG,
    Blocked: ICONS.BLOCKED
};

// Set up context drop zones
[
    { el: todoList, cat: 'TODO' },
    { el: activeList, cat: 'Active' },
    { el: completedList, cat: 'Completed' },
    { el: backlogList, cat: 'Backlog' },
    { el: blockedList, cat: 'Blocked' }
].forEach(zone => {
    if (zone.el) {
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
    }
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

// Restore folding states
Object.keys(collapsedStates).forEach(id => {
    if (collapsedStates[id]) {
        const el = document.getElementById(id);
        if (el) el.classList.add('collapsed');
    }
});

function toggleSection(id) {
    const el = document.getElementById(id);
    const isCollapsed = el.classList.toggle('collapsed');
    collapsedStates[id] = isCollapsed;
    vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates, isCleanView });
}

function toggleCleanView() {
    isCleanView = !isCleanView;
    document.body.classList.toggle('clean-view', isCleanView);
    vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates, isCleanView });
    renderTasks(currentTasks);
}

// Set initial state
if (isCleanView) {
    document.body.classList.add('clean-view');
}
if (previousState && previousState.workspaceName) {
    workspaceNameEl.textContent = previousState.workspaceName;
}
if (currentTasks.length > 0) {
    renderTasks(currentTasks);
}

vscode.postMessage({ type: 'ready' });

// Fix for cross-origin focus restriction
window.addEventListener('load', () => {
    setTimeout(() => {
        input.focus();
    }, 100);
});

// Auto-expand textarea
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
});

dateInput.addEventListener('change', () => {
    if (dateInput.value) {
        dateWrapper.classList.add('has-date');
        dateWrapper.setAttribute('data-tooltip', 'Due: ' + dateInput.value);
    } else {
        dateWrapper.classList.remove('has-date');
        dateWrapper.setAttribute('data-tooltip', 'Set Due Date');
    }
});

function openDatePicker() {
    console.log("Requesting Date Picker...");
    try {
        // First ensure focus
        dateInput.focus();

        // Try showPicker first if available (modern way)
        if (typeof dateInput.showPicker === 'function') {
            try {
                dateInput.showPicker();
                console.log("showPicker() successful");
                return;
            } catch (secErr) {
                console.warn("showPicker blocked by security policy, falling back to click()");
            }
        }

        // Fallback to click()
        dateInput.click();
        console.log("dateInput.click() executed");
    } catch (err) {
        console.error('Error triggering date input:', err);
    }
}

dateWrapper.addEventListener('click', (e) => {
    // Ensure we don't recurse if the click was already on the input or meant for it
    if (e.target === dateWrapper || e.target.classList.contains('calander-icon')) {
        e.preventDefault();
        openDatePicker();
    }
});

function submitTask() {
    const val = input.value.trim();
    if (val) {
        const newId = Date.now().toString();
        lastAddedTaskId = newId;

        vscode.postMessage({
            type: 'addTask',
            value: val,
            dueDate: dateInput.value || null,
            id: newId
        });
        input.value = '';
        input.style.height = 'auto';
        dateInput.value = '';
        dateWrapper.classList.remove('has-date');
        dateWrapper.setAttribute('data-tooltip', 'Set Due Date');
        input.focus();

        // Clear the flash tracking after 3 seconds
        setTimeout(() => {
            if (lastAddedTaskId === newId) {
                lastAddedTaskId = null;
            }
        }, 3000);
    }
}

input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        // Case: User wants to set a date.
        // We stop the focus from leaving the webview and instead 
        // focus our own date input.
        e.preventDefault();
        dateInput.focus();
        console.log("Tab pressed: Focus moved to dateInput");
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitTask();
    }
});

dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        // User is on date input and presses Enter
        if (!dateInput.value) {
            // No date set, open the picker
            openDatePicker();
        } else {
            // Date set, submit task
            submitTask();
        }
    }
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'updateTasks') {
        currentTasks = message.tasks;
        if (message.workspaceName) {
            workspaceNameEl.textContent = message.workspaceName;
        }

        vscode.setState({ tasks: currentTasks, workspaceName: message.workspaceName, collapsedStates, isCleanView });
        renderTasks(currentTasks);
    }
});

function renderTasks(tasks) {
    todoList.innerHTML = '';
    activeList.innerHTML = '';
    completedList.innerHTML = '';
    backlogList.innerHTML = '';
    blockedList.innerHTML = '';

    let counts = { TODO: 0, Active: 0, Completed: 0, Backlog: 0, Blocked: 0 };

    tasks.forEach((task, index) => {
        const category = task.category || 'Active';
        counts[category]++;

        const li = document.createElement('div');
        const isNew = String(task.id) === String(lastAddedTaskId);
        li.className = `task-item cat-${category}` +
            (category === 'Completed' ? ' completed' : '') +
            (isNew ? ' flash-new' : '');
        li.draggable = true;
        li.dataset.id = task.id;
        li.dataset.index = index;

        const dueStatus = getDueStatus(task.dueDate);
        const dueDateStr = formatDueDate(task.dueDate, dueStatus);
        const combinedTooltip = `Date : ${dueDateStr}\nTask : ${task.title}`;
        li.setAttribute('data-tooltip', combinedTooltip);

        let switcherHtml = '';
        Object.keys(categoryIcons).forEach(cat => {
            if (cat !== category) {
                switcherHtml += `
                    <button class="switcher-btn" data-tooltip="Mark as ${cat}" onclick="event.stopPropagation(); changeCategory('${task.id}', '${cat}')">
                        ${categoryIcons[cat]}
                    </button>
                `;
            }
        });

        li.innerHTML = `
            <div class="due-dot ${dueStatus}"></div>
            <span class="task-title">${escapeHtml(task.title)}</span>
            <div class="switcher">
                ${switcherHtml}
                <button class="switcher-btn delete-task-btn" data-tooltip="Delete Task" onclick="event.stopPropagation(); deleteTask('${task.id}')">
                    ${ICONS.DELETE_TASK}
                </button>
            </div>
        `;

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
        li.addEventListener('dragover', (e) => {
            handleDragOver(e);
            
            // Visual feedback for insertion point
            const rect = li.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (e.clientY < midpoint) {
                li.classList.add('drop-target-above');
                li.classList.remove('drop-target-below');
            } else {
                li.classList.add('drop-target-below');
                li.classList.remove('drop-target-above');
            }
        });
        li.addEventListener('dragleave', () => {
            li.classList.remove('drop-target-above');
            li.classList.remove('drop-target-below');
        });
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);

        if (category === 'TODO') todoList.appendChild(li);
        else if (category === 'Active') activeList.appendChild(li);
        else if (category === 'Completed') completedList.appendChild(li);
        else if (category === 'Backlog') backlogList.appendChild(li);
        else if (category === 'Blocked') blockedList.appendChild(li);

        // Scroll new items into view
        if (task.id === lastAddedTaskId) {
            setTimeout(() => {
                li.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    });

    // Update Header Icons and Counts
    Object.keys(counts).forEach(cat => {
        const sectionId = cat.toLowerCase() + 'Section';
        const iconEl = document.getElementById(cat.toLowerCase() + 'HeaderIcon');
        const countEl = document.getElementById(cat.toLowerCase() + 'HeaderCount');
        const sectionEl = document.getElementById(sectionId);

        if (iconEl) iconEl.innerHTML = categoryIcons[cat];
        if (countEl) countEl.textContent = counts[cat];

        if (sectionEl) {
            if (isCleanView && counts[cat] === 0) {
                sectionEl.style.display = 'none';
            } else {
                sectionEl.style.display = 'flex';
            }
        }
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Due Today';
    
    if (diffDays > 0 && diffDays <= 15) {
        return `${diffDays} days left`;
    }
    
    if (diffDays < 0 && diffDays >= -15) {
        const ago = Math.abs(diffDays);
        return `Due ${ago} day${ago > 1 ? 's' : ''} ago`;
    }

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

    this.classList.remove('drop-target-above');
    this.classList.remove('drop-target-below');

    if (dragSourceEl && dragSourceEl !== this) {
        const sourceId = dragSourceEl.dataset.id;
        const targetId = this.dataset.id;

        const rect = this.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const insertAfter = e.clientY >= midpoint;

        // Determine target category from the item's classes
        const targetCategory = Array.from(this.classList)
            .find(c => c.startsWith('cat-'))
            ?.replace('cat-', '') || 'Active';

        const sourceIndex = currentTasks.findIndex(t => t.id === sourceId);
        
        if (sourceIndex !== -1) {
            const newTasks = [...currentTasks];
            const [movedTask] = newTasks.splice(sourceIndex, 1);

            // Update category
            movedTask.category = targetCategory;
            movedTask.completed = (targetCategory === 'Completed');

            // Find new target index after removal
            let finalTargetIndex = newTasks.findIndex(t => t.id === targetId);
            if (insertAfter) {
                finalTargetIndex++;
            }
            
            newTasks.splice(finalTargetIndex, 0, movedTask);

            currentTasks = newTasks;
            vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates, isCleanView });
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
            newTasks.push(movedTask);

            currentTasks = newTasks;
            vscode.setState({ tasks: currentTasks, workspaceName: workspaceNameEl.textContent, collapsedStates, isCleanView });
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

function clearBlocked() {
    vscode.postMessage({ type: 'clearCategory', category: 'Blocked' });
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
