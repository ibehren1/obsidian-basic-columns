import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { columnsEditorExtension } from './live-preview';
import { columnsPostProcessor } from './reading';
import {
	BasicColumnsSettingTab,
	BasicColumnsSettings,
	DEFAULT_SETTINGS,
} from './settings';

export default class BasicColumnsPlugin extends Plugin {
	settings: BasicColumnsSettings = { ...DEFAULT_SETTINGS };
	/** Main window plus any popout windows, so settings apply everywhere. */
	private documents = new Set<Document>();

	async onload() {
		await this.loadSettings();

		this.documents.add(document);
		this.registerEvent(
			this.app.workspace.on('window-open', (_win, window) => {
				this.documents.add(window.document);
				this.applySettings();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('window-close', (_win, window) => {
				this.documents.delete(window.document);
			}),
		);
		this.applySettings();

		this.addSettingTab(new BasicColumnsSettingTab(this.app, this));
		this.registerMarkdownPostProcessor(columnsPostProcessor);
		this.registerEditorExtension(columnsEditorExtension(this.app));
		registerCommands(this);
	}

	onunload() {
		this.documents.forEach((doc) =>
			doc.body.setCssProps({ '--bc-divider-opacity': '' }),
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BasicColumnsSettings> | null,
		);
	}

	async updateSettings(changes: Partial<BasicColumnsSettings>) {
		Object.assign(this.settings, changes);
		this.applySettings();
		await this.saveData(this.settings);
	}

	private applySettings() {
		this.documents.forEach((doc) =>
			doc.body.setCssProps({
				'--bc-divider-opacity': String(this.settings.dividerOpacity),
			}),
		);
	}
}
