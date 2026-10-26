import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { columnsEditorExtension } from './live-preview';
import { columnsPostProcessor } from './reading';

export default class BasicColumnsPlugin extends Plugin {
	onload() {
		this.registerMarkdownPostProcessor(columnsPostProcessor);
		this.registerEditorExtension(columnsEditorExtension(this.app));
		registerCommands(this);
	}
}
