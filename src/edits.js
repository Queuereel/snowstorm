import vscode from './vscode_extension'
import {generateFile} from './export'
import {compileJSON} from './util'

const EditListeners = {};
let timeout;
let typing_merge_threshold = 600;
let last_edit_id = '';

// ---- Undo / redo history -------------------------------------------------------------------
// Each processed edit (one user action; rapid typing is merged via the debounce below) is a
// checkpoint. We snapshot the whole particle as the same JSON used for saving, and restore it
// through a handler registered by import.js (updateConfig). Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)
// step through the history.
const HISTORY_LIMIT = 200;
let undo_stack = [];
let redo_stack = [];
let current_snapshot = null;
let applying_history = false;
let restoreHandler = null;

function snapshot() {
    try {
        return compileJSON(generateFile());
    } catch (err) {
        return null;
    }
}
function captureEdit() {
    let snap = snapshot();
    if (snap == null) return;
    if (current_snapshot != null && snap !== current_snapshot) {
        undo_stack.push(current_snapshot);
        if (undo_stack.length > HISTORY_LIMIT) undo_stack.shift();
        redo_stack = [];
    }
    current_snapshot = snap;
}
function applySnapshot(snap) {
    if (!restoreHandler || snap == null) return;
    applying_history = true;
    try {
        restoreHandler(JSON.parse(snap));
    } catch (err) {
        console.warn('Undo/redo restore failed', err);
    }
    applying_history = false;
    current_snapshot = snap;
}

/** Called by import.js to provide the function that loads a serialized particle back in. */
export function setHistoryRestorer(fn) {
    restoreHandler = fn;
}
/** Reset the history baseline (call after opening/loading a particle). */
export function resetHistory() {
    undo_stack = [];
    redo_stack = [];
    current_snapshot = snapshot();
}
export function undoEdit() {
    if (!undo_stack.length) return;
    redo_stack.push(current_snapshot);
    applySnapshot(undo_stack.pop());
}
export function redoEdit() {
    if (!redo_stack.length) return;
    undo_stack.push(current_snapshot);
    applySnapshot(redo_stack.pop());
}

function processEdit(id) {
    if (!applying_history) captureEdit();

    // In project mode, edits are buffered in the project store and only written to disk on Ctrl+S.
    // Otherwise fall back to the legacy hosted auto-save.
    if (window.ProjectStore && window.ProjectStore.active) {
        window.ProjectStore.captureActiveEdit();
    } else if (vscode) {
        let content = compileJSON(generateFile())
        vscode.postMessage({
            type: 'save',
            content
        });
    }
    for (var key in EditListeners) {
        let handler = EditListeners[key];
        handler(id)
    }
}

function wrapTimeoutInit() {
    if (timeout) {
        clearTimeout(timeout);
        processEdit(last_edit_id)
    }
}
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'request_content_update':
            wrapTimeoutInit()
            return;
    }
});

// Global Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for editor actions. The texture editor keeps its own
// undo when it is hovered (handled in texture_edit.js), so we defer to it in that case.
window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    let key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;

    // Let the texture editor handle undo/redo when the cursor is over it.
    if (document.querySelector('.texture_input:hover')) return;

    let redo = (key === 'y') || (key === 'z' && event.shiftKey);
    event.preventDefault();
    if (redo) {
        redoEdit();
    } else {
        undoEdit();
    }
});

export default function registerEdit(id, event, cooldown) {
    last_edit_id = id;
    if (event instanceof InputEvent || event instanceof KeyboardEvent || cooldown) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            processEdit(id);
            timeout = null;
        }, typing_merge_threshold)
    } else {
        processEdit(id);
    }
}

export {EditListeners}
