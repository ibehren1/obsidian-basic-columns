import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	BasicColumnsSettings,
	BasicColumnsSettingTab,
} from './settings';

export default class BasicColumnsPlugin extends Plugin {
	settings!: BasicColumnsSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new BasicColumnsSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BasicColumnsSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
