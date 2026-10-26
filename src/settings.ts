import { App, PluginSettingTab } from 'obsidian';
import BasicColumnsPlugin from './main';

export type BasicColumnsSettings = Record<string, never>;

export const DEFAULT_SETTINGS: BasicColumnsSettings = {};

export class BasicColumnsSettingTab extends PluginSettingTab {
	plugin: BasicColumnsPlugin;

	constructor(app: App, plugin: BasicColumnsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
	}
}
