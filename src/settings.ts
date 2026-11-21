import { App, PluginSettingTab, Setting } from 'obsidian';
import type BasicColumnsPlugin from './main';

export interface BasicColumnsSettings {
	/** Opacity of the line between columns, from 0 (hidden) to 1 (theme default). */
	dividerOpacity: number;
	dividerResize: boolean;
}

export const DEFAULT_SETTINGS: BasicColumnsSettings = {
	dividerOpacity: 1,
	dividerResize: true,
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

		new Setting(containerEl)
			.setName('Drag dividers to resize')
			.setDesc(
				'Hovering the line between columns highlights it, dragging it resizes the columns, and double-clicking it makes them equal again. Turn off to keep the line still.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.dividerResize).onChange(async (value) => {
					await this.plugin.updateSettings({ dividerResize: value });
				}),
			);
	}
}
