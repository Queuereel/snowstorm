/*
 * UI refresh signal.
 *
 * The Molang fields use a contenteditable code editor (vue-prism-editor) that initializes from its
 * value prop but does NOT re-sync when the value changes programmatically (to avoid cursor jumps
 * while typing). So undo/redo, applying a preset, or switching particles updates the underlying
 * data but leaves those editors showing stale text. Bumping this reactive tick on such bulk changes
 * lets the sidebar re-key (remount) its input editors so they pick up the new values. It is NOT
 * bumped on ordinary keystroke edits, so typing is never interrupted.
 */
import Vue from 'vue';

export const UiRefresh = Vue.observable({ tick: 0 });

export function bumpRefresh() {
	UiRefresh.tick++;
}

export default UiRefresh;
