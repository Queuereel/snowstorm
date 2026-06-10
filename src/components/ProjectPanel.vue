<template>
	<div id="project_panel">
		<div class="project_header">
			<div class="project_title" :title="state.name">{{ state.name || $t('project.untitled') }}</div>
			<div class="project_actions">
				<div class="tool" @click="store.openFolder()" :title="$t('project.open_folder')"><FolderOpen :size="18" /></div>
				<div class="tool" @click="store.openSnow()" :title="$t('project.open_project')"><Package :size="18" /></div>
				<div class="tool" @click="store.newParticle()" :title="$t('project.new')"><FilePlus :size="18" /></div>
				<div class="tool" :class="{highlight: dirtyCount}" @click="store.save()" :title="saveTitle"><Save :size="18" /></div>
			</div>
		</div>

		<div class="project_search">
			<Search :size="15" />
			<input type="text" :value="state.search" @input="store.setSearch($event.target.value)" :placeholder="$t('project.search')">
		</div>

		<ul class="project_list">
			<li v-if="!particles.length" class="project_empty">{{ $t('project.empty') }}</li>
			<li v-for="p in particles" :key="p.id"
				class="project_item"
				:class="{active: p.id === state.activeId, checked: p.selected}"
				@click="store.setActive(p.id)"
				@contextmenu.prevent="showContext(p, $event)"
				:title="p.path || p.id"
			>
				<input type="checkbox" class="project_check" :checked="p.selected" @click.stop="store.toggleSelected(p.id)" title="Select for batch save">
				<span class="project_item_text">
					<span class="project_item_id">{{ shortId(p.id) }}</span>
					<span class="project_item_sub">{{ subtitle(p) }}</span>
				</span>
			</li>
		</ul>

		<div v-if="ctxMenu" class="ctx_menu" :style="{top: ctxMenu.y+'px', left: ctxMenu.x+'px'}">
			<div class="ctx_item" @click="ctxSave()">Save</div>
			<div class="ctx_item ctx_cancel" @click="ctxMenu=null">Cancel</div>
		</div>
	</div>
</template>

<script>
import ProjectStore from '../project_store';
import { FolderOpen, Package, FilePlus, Save, Search } from 'lucide-vue';

export default {
	name: 'project-panel',
	components: { FolderOpen, Package, FilePlus, Save, Search },
	data() {
		return { store: ProjectStore, state: ProjectStore.state, ctxMenu: null };
	},
	computed: {
		particles() {
			return this.store.filteredParticles();
		},
		dirtyCount() {
			return this.store.dirtyCount;
		},
		saveTitle() {
			let n = this.store.selectedCount;
			let base = this.$t('project.save');
			if (n) return base + ' — ' + n + ' selected';
			return base + (this.dirtyCount ? ' (' + this.dirtyCount + ')' : '');
		},
	},
	mounted() {
		this._dismissCtx = () => { this.ctxMenu = null; };
		window.addEventListener('click', this._dismissCtx);
	},
	beforeDestroy() {
		window.removeEventListener('click', this._dismissCtx);
	},
	methods: {
		showContext(p, event) {
			// Position the menu inside the panel (fixed coords).
			this.ctxMenu = { particle: p, y: event.clientY, x: event.clientX };
		},
		ctxSave() {
			if (!this.ctxMenu) return;
			this.store.saveOne(this.ctxMenu.particle.id);
			this.ctxMenu = null;
		},
		shortId(id) {
			return id && id.includes(':') ? id.split(':').slice(1).join(':') : id;
		},
		subtitle(p) {
			if (p.path) {
				let parts = p.path.replace(/\\/g, '/').split('/');
				return parts.slice(-2).join('/');
			}
			return p.id;
		},
	},
};
</script>

<style scoped>
	#project_panel {
		grid-area: project;
		background-color: var(--color-dark);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		height: 100%;
	}
	.project_header {
		display: flex;
		align-items: center;
		padding: 6px 4px 6px 10px;
		gap: 4px;
		border-bottom: 1px solid var(--color-border);
	}
	.project_title {
		flex: 1 1 auto;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--color-light);
	}
	.project_actions {
		display: flex;
		flex-shrink: 0;
	}
	.project_actions .tool {
		width: 28px;
		height: 28px;
		padding: 5px;
		border-radius: 3px;
	}
	.project_actions .tool.highlight {
		color: var(--color-highlight);
	}
	.project_search {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 8px;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text_grayed);
	}
	.project_search input {
		flex: 1 1 auto;
		background: transparent;
		border: none;
		outline: none;
		color: var(--color-text);
	}
	.project_list {
		flex: 1 1 auto;
		overflow-y: auto;
		padding: 4px 0;
	}
	.project_empty {
		padding: 16px 12px;
		color: var(--color-text_grayed);
		font-size: 0.9em;
		line-height: 1.4;
	}
	.project_item {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 8px;
		cursor: pointer;
		border-left: 2px solid transparent;
	}
	.project_item:hover {
		background-color: var(--color-bar);
	}
	.project_item.active {
		background-color: var(--color-bar);
		border-left-color: var(--color-accent);
	}
	.project_item.checked {
		background-color: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}
	.project_check {
		flex-shrink: 0;
		margin: 0;
		cursor: pointer;
	}
	.project_item_text {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		flex: 1 1 auto;
		min-width: 0;
	}
	.project_item_id {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.project_item_sub {
		font-size: 0.78em;
		color: var(--color-text_grayed);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ctx_menu {
		position: fixed;
		z-index: 200;
		background-color: var(--color-bar);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 14px rgba(0,0,0,0.35);
		min-width: 130px;
		padding: 3px 0;
	}
	.ctx_item {
		padding: 7px 14px;
		cursor: pointer;
		font-size: 0.95em;
	}
	.ctx_item:hover {
		background-color: var(--color-background);
		color: var(--color-highlight);
	}
	.ctx_cancel {
		color: var(--color-text_grayed);
		border-top: 1px solid var(--color-border);
	}
</style>
