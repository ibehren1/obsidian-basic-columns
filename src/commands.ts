import { Editor, Menu, Notice, Plugin } from 'obsidian';
import { EditorView } from '@codemirror/view';
import {
	createColumnBlock,
	findBlockAt,
	unwrapColumns,
} from './model';
import { focusColumnAt } from './live-preview';


export function insertColumns(editor: Editor, count: number) {
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	const hasSelection = editor.somethingSelected();
	const first = from.line;
	const last = hasSelection && to.ch === 0 && to.line > first ? to.line - 1 : to.line;
	const isBlank = (line: number) =>
		line < 0 || line >= editor.lineCount() || editor.getLine(line).trim() === '';
	const endOf = (line: number) => ({ line, ch: editor.getLine(line).length });

	// Selected lines (or an empty current line) become the columns. Otherwise
	// the columns go below the current line. Blank lines around the block keep
	// surrounding text full width.
	const replace = hasSelection || isBlank(first);
	const selected = hasSelection
		? editor.getRange({ line: first, ch: 0 }, endOf(last))
		: '';
	const block = createColumnBlock(count, selected);
	const after = editor.lineCount() > last + 1 && isBlank(last + 1) ? '' : '\n';

	let blockLine: number;
	if (replace) {
		const before = isBlank(first - 1) ? '' : '\n';
		editor.replaceRange(before + block + after, { line: first, ch: 0 }, endOf(last));
		blockLine = first + (before ? 1 : 0);
	} else {
		editor.replaceRange('\n\n' + block + after, endOf(first));
		blockLine = first + 2;
	}

	const view = (editor as unknown as { cm?: EditorView }).cm;
	if (!view) return;
	const blockFrom = view.state.doc.line(blockLine + 1).from;
	window.requestAnimationFrame(() => {
		if (!focusColumnAt(view, blockFrom, 0, 'end')) {
			// Source mode: put the cursor on the first column's line.
			editor.setCursor({ line: blockLine + 1, ch: 2 });
		}
	});
}

function removeColumnsAtCursor(editor: Editor, checking: boolean): boolean {
	const lines = editor.getValue().split('\n');
	const block = findBlockAt(lines, editor.getCursor().line);
	if (!block) return false;
	if (!checking) {
		editor.replaceRange(
			unwrapColumns(block),
			{ line: block.fromLine, ch: 0 },
			{ line: block.toLine, ch: lines[block.toLine]!.length },
		);
	}
	return true;
}

const COLUMN_COUNTS = [2, 3, 4];

const columnsIcon = (count: number) => `columns-${count}`;

export function registerCommands(plugin: Plugin) {
	for (const count of COLUMN_COUNTS) {
		plugin.addCommand({
			id: `insert-${count}-columns`,
			name: `Insert ${count} columns`,
			icon: columnsIcon(count),
			editorCallback: (editor) => insertColumns(editor, count),
		});
	}
	plugin.addCommand({
		id: 'remove-columns',
		name: 'Remove columns (keep content)',
		editorCheckCallback: (checking, editor) =>
			removeColumnsAtCursor(editor, checking),
	});

	plugin.addRibbonIcon('columns-3', 'Insert columns', (evt) => {
		const editor = plugin.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice('Open a note to insert columns.');
			return;
		}
		const menu = new Menu();
		for (const count of COLUMN_COUNTS) {
			menu.addItem((item) =>
				item
					.setTitle(`${count} columns`)
					.setIcon(columnsIcon(count))
					.onClick(() => insertColumns(editor, count)),
			);
		}
		menu.showAtMouseEvent(evt);
	});

	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			for (const count of COLUMN_COUNTS) {
				menu.addItem((item) =>
					item
						.setTitle(`Insert ${count} columns`)
						.setIcon(columnsIcon(count))
						.setSection('insert')
						.onClick(() => insertColumns(editor, count)),
				);
			}
		}),
	);
}
