// A small markdown editor that lives inside one column.
//
// Uses Obsidian's internal MarkdownEditor class (the same editor used for
// notes) so columns get full Live Preview, `[[` link suggestions, list
// handling, etc. It isn't exposed in the public API, so we pull it off an
// embedded markdown view at runtime. If that ever stops working, we fall back
// to a plain CodeMirror editor so the plugin keeps working.

import { App, MarkdownFileInfo, TFile } from 'obsidian';
import { Extension, Prec, Transaction } from '@codemirror/state';
import { EditorView, ViewUpdate, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { minimalChange } from './model';

export interface ColumnEditor {
	readonly view: EditorView;
	getValue(): string;
	setValue(value: string): void;
	destroy(): void;
}

export interface ColumnEditorOptions {
	value: string;
	file: TFile | null;
	onChange: (value: string) => void;
	extensions: Extension;
}

interface InternalMarkdownEditor {
	editor: { cm: EditorView };
	containerEl: HTMLElement;
	set(value: string, clear: boolean): void;
	onUpdate(update: ViewUpdate, changed: boolean): void;
	buildLocalExtensions(): Extension[];
	unload(): void;
	destroy(): void;
	_loaded?: boolean;
}

type InternalMarkdownEditorClass = new (
	app: App,
	container: HTMLElement,
	owner: unknown,
) => InternalMarkdownEditor;

interface EmbedRegistry {
	embedByExtension: {
		md: (
			ctx: { app: App; containerEl: HTMLElement },
			file: TFile | null,
			subpath: string,
		) => {
			editable: boolean;
			showEditor(): void;
			unload(): void;
			editMode: object;
		};
	};
}

interface WorkspaceInternals {
	activeEditor: MarkdownFileInfo | null;
}

let cachedClass: InternalMarkdownEditorClass | null | undefined;

const owners = new WeakSet<object>();

/**
 * Hands the active editor back to the note once a column editor loses focus.
 * Obsidian ignores assigning a MarkdownView here; null falls back to it.
 */
function releaseActiveEditor(app: App) {
	const workspace = app.workspace as unknown as WorkspaceInternals;
	const active = workspace.activeEditor;
	if (active && owners.has(active)) {
		workspace.activeEditor = null;
	}
}

function resolveMarkdownEditorClass(app: App): InternalMarkdownEditorClass | null {
	if (cachedClass !== undefined) return cachedClass;
	try {
		const registry = (app as unknown as { embedRegistry: EmbedRegistry })
			.embedRegistry;
		const embed = registry.embedByExtension.md(
			{ app, containerEl: createDiv() },
			null,
			'',
		);
		embed.editable = true;
		embed.showEditor();
		const proto = Object.getPrototypeOf(
			Object.getPrototypeOf(embed.editMode),
		) as { constructor: InternalMarkdownEditorClass };
		embed.unload();
		cachedClass = proto.constructor;
	} catch (e) {
		console.warn(
			'Basic Columns: falling back to a plain editor inside columns.',
			e,
		);
		cachedClass = null;
	}
	return cachedClass;
}

/** Applies an outside change (e.g. undo in the note) without moving the cursor. */
function replaceContent(view: EditorView, value: string) {
	const change = minimalChange(view.state.doc.toString(), value);
	if (!change) return;
	view.dispatch({
		changes: change,
		annotations: Transaction.addToHistory.of(false),
	});
}

function createObsidianEditor(
	Base: InternalMarkdownEditorClass,
	app: App,
	container: HTMLElement,
	options: ColumnEditorOptions,
): ColumnEditor {
	const workspace = app.workspace as unknown as WorkspaceInternals;
	const owner: Record<string, unknown> = {
		app,
		file: options.file,
		onMarkdownScroll: () => {},
		getMode: () => 'source',
	};
	owners.add(owner);

	let silent = false;

	class ColumnMarkdownEditor extends Base {
		buildLocalExtensions(): Extension[] {
			const extensions = super.buildLocalExtensions();
			extensions.push(Prec.highest(options.extensions));
			return extensions;
		}

		onUpdate(update: ViewUpdate, changed: boolean) {
			super.onUpdate(update, changed);
			if (update.docChanged && !silent) {
				options.onChange(update.state.doc.toString());
			}
		}
	}

	const editor = new ColumnMarkdownEditor(app, container, owner);
	owner.editMode = editor;
	owner.editor = editor.editor;
	editor.set(options.value, false);

	const cm = editor.editor.cm;
	cm.contentDOM.addEventListener('focusin', () => {
		workspace.activeEditor = owner as unknown as MarkdownFileInfo;
	});
	cm.contentDOM.addEventListener('focusout', () => releaseActiveEditor(app));

	return {
		view: cm,
		getValue: () => cm.state.doc.toString(),
		setValue: (value) => {
			silent = true;
			try {
				replaceContent(cm, value);
			} finally {
				silent = false;
			}
		},
		destroy: () => {
			if (editor._loaded) editor.unload();
			editor.destroy();
			container.empty();
		},
	};
}

function createPlainEditor(
	container: HTMLElement,
	options: ColumnEditorOptions,
): ColumnEditor {
	let silent = false;
	const view = new EditorView({
		parent: container,
		doc: options.value,
		extensions: [
			Prec.highest(options.extensions),
			keymap.of(defaultKeymap),
			EditorView.lineWrapping,
			EditorView.updateListener.of((update) => {
				if (update.docChanged && !silent) {
					options.onChange(update.state.doc.toString());
				}
			}),
		],
	});
	return {
		view,
		getValue: () => view.state.doc.toString(),
		setValue: (value) => {
			silent = true;
			try {
				replaceContent(view, value);
			} finally {
				silent = false;
			}
		},
		destroy: () => view.destroy(),
	};
}

export function createColumnEditor(
	app: App,
	container: HTMLElement,
	options: ColumnEditorOptions,
): ColumnEditor {
	const Base = resolveMarkdownEditorClass(app);
	if (Base) {
		try {
			return createObsidianEditor(Base, app, container, options);
		} catch (e) {
			console.warn('Basic Columns: embedded editor failed, using plain editor.', e);
			container.empty();
		}
	}
	return createPlainEditor(container, options);
}
