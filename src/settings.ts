import { App, PluginSettingTab, Setting } from 'obsidian';
import type BasicColumnsPlugin from './main';

export interface BasicColumnsSettings {
	/** Opacity of the line between columns, from 0 (hidden) to 1 (theme default). */
	dividerOpacity: number;
}

export const DEFAULT_SETTINGS: BasicColumnsSettings = {
	dividerOpacity: 1,
};

export class BasicColumnsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: BasicColumnsPlugin,
	) {
		super(app, plugin);
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Divider opacity')
			.setDesc('How visible the line between columns is, in percent. The default, 100, uses your theme\'s border color.')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(Math.round(this.plugin.settings.dividerOpacity * 100))
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.updateSettings({ dividerOpacity: value / 100 });
					}),
			);
	}
}
