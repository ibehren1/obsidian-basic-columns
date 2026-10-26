import {
	App,
	editorInfoField,
	editorLivePreviewField,
	setIcon,
} from 'obsidian';
import {
	EditorSelection,
	EditorState,
	Extension,
	Prec,
	RangeSetBuilder,
	StateEffect,
	StateField,
	Text,
} from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	KeyBinding,
	WidgetType,
	keymap,
} from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import { ColumnEditor, createColumnEditor } from './embedded-editor';
import {
	ColumnBlock,
	addColumn,
	findBlockAt,
	findColumnBlocks,
	minimalChange,
	normalizeWidths,
	removeColumn,
	resizeColumns,
	serializeColumnBlock,
	unwrapColumns,
} from './model';
import { applyWidths } from './reading';

type BlockData = Pick<ColumnBlock, 'widths' | 'title' | 'columns'>;

interface Range {
	from: number;
	to: number;
	block: ColumnBlock;
}

function blockRange(doc: Text, block: ColumnBlock): Range {
	return {
		from: doc.line(block.fromLine + 1).from,
		to: doc.line(block.toLine + 1).to,
		block,
	};
}

function blocksIn(doc: Text): Range[] {
	return findColumnBlocks(doc.toString().split('\n')).map((b) =>
		blockRange(doc, b),
	);
}

/** Toggles raw markdown editing for the block starting at the given position. */
const showSource = StateEffect.define<number>();

interface FieldValue {
	decorations: DecorationSet;
	/** Block start positions currently shown as raw markdown. */
	source: number[];
	livePreview: boolean;
}

const controllers = new WeakMap<HTMLElement, ColumnsController>();
const viewControllers = new WeakMap<EditorView, Set<ColumnsController>>();

function buildField(app: App): StateField<FieldValue> {
	function build(state: EditorState, source: number[]): FieldValue {
		const livePreview = state.field(editorLivePreviewField, false) ?? false;
		const builder = new RangeSetBuilder<Decoration>();
		const keptSource: number[] = [];
		if (livePreview) {
			const head = state.selection.main.head;
			for (const range of blocksIn(state.doc)) {
				if (source.includes(range.from)) {
					// Leave source mode once the cursor moves out of the block.
					if (head >= range.from && head <= range.to) {
						keptSource.push(range.from);
						continue;
					}
				}
				builder.add(
					range.from,
					range.to,
					Decoration.replace({
						block: true,
						widget: new ColumnsWidget(app, range.block),
					}),
				);
			}
		}
		return {
			decorations: builder.finish(),
			source: keptSource,
			livePreview,
		};
	}

	return StateField.define<FieldValue>({
		create: (state) => build(state, []),
		update(value, tr) {
			let source = value.source.map((p) => tr.changes.mapPos(p));
			let toggled = false;
			for (const e of tr.effects) {
				if (e.is(showSource)) {
					toggled = true;
					source = source.includes(e.value)
						? source.filter((p) => p !== e.value)
						: [...source, e.value];
				}
			}
			const livePreview =
				tr.state.field(editorLivePreviewField, false) ?? false;
			if (
				!tr.docChanged &&
				!toggled &&
				livePreview === value.livePreview &&
				!(tr.selection && source.length)
			) {
				return value;
			}
			return build(tr.state, source);
		},
		provide: (field) => [
			EditorView.decorations.from(field, (v) => v.decorations),
			EditorView.atomicRanges.of(
				(view) => view.state.field(field).decorations,
			),
		],
	});
}

class ColumnsWidget extends WidgetType {
	readonly key: string;

	constructor(
		readonly app: App,
		readonly block: ColumnBlock,
	) {
		super();
		this.key = serializeColumnBlock(block);
	}

	eq(other: ColumnsWidget) {
		return other.key === this.key;
	}

	toDOM(view: EditorView): HTMLElement {
		return new ColumnsController(this.app, view, this.block).dom;
	}

	updateDOM(dom: HTMLElement): boolean {
		const controller = controllers.get(dom);
		if (!controller) return false;
		controller.update(this.block);
		return true;
	}

	destroy(dom: HTMLElement) {
		controllers.get(dom)?.destroy();
	}

	ignoreEvent() {
		return true;
	}
}

type Edge = 'start' | 'end';

class ColumnsController {
	readonly dom: HTMLElement;
	private columnsEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private columnEls: HTMLElement[] = [];
	private editors: ColumnEditor[] = [];
	private data: BlockData;

	constructor(
		private app: App,
		private view: EditorView,
		block: ColumnBlock,
	) {
		this.data = cloneData(block);
		this.dom = createDiv({ cls: 'bc-columns-widget' });
		this.toolbarEl = this.dom.createDiv({ cls: 'bc-toolbar' });
		this.columnsEl = this.dom.createDiv({ cls: 'bc-columns' });
		this.buildToolbar();
		this.buildColumns();

		controllers.set(this.dom, this);
		let set = viewControllers.get(view);
		if (!set) viewControllers.set(view, (set = new Set()));
		set.add(this);
	}

	/** Current location of this block in the parent document. */
	range(): Range | null {
		let pos: number;
		try {
			pos = this.view.posAtDOM(this.dom);
		} catch {
			return null;
		}
		const doc = this.view.state.doc;
		const block = findBlockAt(
			doc.toString().split('\n'),
			doc.lineAt(pos).number - 1,
		);
		return block ? blockRange(doc, block) : null;
	}

	update(block: ColumnBlock) {
		const next = cloneData(block);
		if (next.columns.length !== this.editors.length) {
			this.data = next;
			this.buildColumns();
			this.updateToolbar();
			return;
		}
		next.columns.forEach((text, i) => {
			const editor = this.editors[i]!;
			if (editor.getValue() !== text) editor.setValue(text);
		});
		this.data = next;
		applyWidths(this.columnEls, this.data.widths);
	}

	focusColumn(index: number, edge: Edge) {
		const editor = this.editors[index];
		if (!editor) return;
		const pos = edge === 'start' ? 0 : editor.view.state.doc.length;
		editor.view.focus();
		editor.view.dispatch({ selection: EditorSelection.cursor(pos) });
	}

	destroy() {
		this.editors.forEach((e) => e.destroy());
		this.editors = [];
		viewControllers.get(this.view)?.delete(this);
	}

	private commit(data: BlockData = this.data, insert?: string) {
		const range = this.range();
		if (!range) return;
		const change = minimalChange(
			this.view.state.doc.sliceString(range.from, range.to),
			insert ?? serializeColumnBlock(data),
		);
		if (!change) return;
		this.view.dispatch({
			changes: {
				from: range.from + change.from,
				to: range.from + change.to,
				insert: change.insert,
			},
		});
	}

	private buildColumns() {
		this.editors.forEach((e) => e.destroy());
		this.editors = [];
		this.columnEls = [];
		this.columnsEl.empty();

		const info = this.view.state.field(editorInfoField, false) ?? null;
		const count = this.data.columns.length;
		this.data.columns.forEach((text, i) => {
			if (i > 0) this.buildDivider(i - 1);
			const colEl = this.columnsEl.createDiv({ cls: 'bc-column' });
			this.columnEls.push(colEl);
			// Clicking the empty space under a short column still lets you type.
			colEl.addEventListener('mousedown', (e) => {
				if (e.target !== colEl) return;
				e.preventDefault();
				this.focusColumn(i, 'end');
			});
			this.editors.push(
				createColumnEditor(this.app, colEl, {
					value: text,
					file: info?.file ?? null,
					extensions: keymap.of(this.columnKeys(i, count)),
					onChange: (value) => {
						this.data.columns[i] = value;
						this.commit();
					},
				}),
			);
		});
		applyWidths(this.columnEls, this.data.widths);
	}

	private buildDivider(index: number) {
		const divider = this.columnsEl.createDiv({ cls: 'bc-divider' });
		divider.setAttr('aria-label', 'Drag to resize, double-click to reset');
		divider.addEventListener('dblclick', () => {
			this.commit({ ...this.data, widths: null });
		});
		divider.addEventListener('pointerdown', (down) => {
			down.preventDefault();
			divider.setPointerCapture(down.pointerId);
			divider.addClass('is-dragging');
			const count = this.data.columns.length;
			const base =
				normalizeWidths(this.data.widths, count) ??
				Array<number>(count).fill(100 / count);
			const pair = base[index]! + base[index + 1]!;
			const left = this.columnEls[index]!.getBoundingClientRect().left;
			const right = this.columnEls[index + 1]!.getBoundingClientRect().right;
			let widths = this.data.widths;

			const move = (e: PointerEvent) => {
				const share = (e.clientX - left) / (right - left);
				widths = resizeColumns(this.data.widths, count, index, share * pair);
				applyWidths(this.columnEls, widths);
			};
			const up = () => {
				divider.removeEventListener('pointermove', move);
				divider.removeEventListener('pointerup', up);
				divider.removeEventListener('pointercancel', up);
				divider.removeClass('is-dragging');
				if (widths !== this.data.widths) this.commit({ ...this.data, widths });
			};
			divider.addEventListener('pointermove', move);
			divider.addEventListener('pointerup', up);
			divider.addEventListener('pointercancel', up);
		});
	}

	private buildToolbar() {
		const button = (icon: string, label: string, onClick: () => void) => {
			const el = this.toolbarEl.createEl('button', {
				cls: 'clickable-icon bc-toolbar-button',
				attr: { 'aria-label': label },
			});
			setIcon(el, icon);
			el.addEventListener('mousedown', (e) => e.preventDefault());
			el.addEventListener('click', (e) => {
				e.preventDefault();
				onClick();
			});
			return el;
		};
		button('plus', 'Add column', () => this.commit(addColumn(this.data)));
		button('minus', 'Remove last column (content moves left)', () =>
			this.commit(removeColumn(this.data)),
		).addClass('bc-remove-column');
		button('code-2', 'Edit as markdown', () => {
			const range = this.range();
			if (!range) return;
			this.view.dispatch({
				effects: showSource.of(range.from),
				selection: EditorSelection.cursor(range.from),
			});
			this.view.focus();
		});
		button('x', 'Remove columns (keep content)', () =>
			this.commit(this.data, unwrapColumns(this.data)),
		);
		this.updateToolbar();
	}

	private updateToolbar() {
		this.toolbarEl
			.querySelector('.bc-remove-column')
			?.toggleClass('is-disabled', this.data.columns.length <= 2);
	}

	/** Moves the parent cursor to the paragraph above or below this block. */
	private exit(direction: 'up' | 'down') {
		const range = this.range();
		if (!range) return;
		const doc = this.view.state.doc;
		let line = doc.lineAt(direction === 'up' ? range.from : range.to).number;
		const step = direction === 'up' ? -1 : 1;
		// Skip the blank separator lines that keep text out of the callout.
		do {
			line += step;
		} while (line >= 1 && line <= doc.lines && doc.line(line).text.trim() === '');

		this.view.focus();
		if (line < 1) {
			this.view.dispatch({
				changes: { from: 0, insert: '\n\n' },
				selection: EditorSelection.cursor(0),
			});
		} else if (line > doc.lines) {
			// Nothing below; make room to keep typing full width.
			const end = doc.length;
			const insert = doc.lineAt(end).number === doc.lineAt(range.to).number ? '\n\n' : '';
			this.view.dispatch({
				changes: { from: end, insert },
				selection: EditorSelection.cursor(end + insert.length),
			});
		} else {
			const target = doc.line(line);
			this.view.dispatch({
				selection: EditorSelection.cursor(direction === 'up' ? target.to : target.from),
				scrollIntoView: true,
			});
		}
	}

	private columnKeys(index: number, count: number): KeyBinding[] {
		const atStart = (v: EditorView) => {
			const sel = v.state.selection.main;
			return sel.empty && sel.head === 0;
		};
		const atEnd = (v: EditorView) => {
			const sel = v.state.selection.main;
			return sel.empty && sel.head === v.state.doc.length;
		};
		const onFirstLine = (v: EditorView) =>
			v.state.doc.lineAt(v.state.selection.main.head).number === 1;
		const onLastLine = (v: EditorView) =>
			v.state.doc.lineAt(v.state.selection.main.head).number ===
			v.state.doc.lines;
		// Leave arrow keys to Obsidian's popups ([[ links, tags, slash commands).
		const suggestOpen = (v: EditorView) =>
			v.dom.ownerDocument.querySelector('.suggestion-container') !== null;

		// One undo history for the whole note, so Cmd+Z behaves the same
		// inside and outside columns.
		const parent = (command: (view: EditorView) => boolean) => () => {
			command(this.view);
			return true;
		};

		return [
			{ key: 'Mod-z', run: parent(undo), preventDefault: true },
			{ key: 'Mod-Shift-z', run: parent(redo), preventDefault: true },
			{ key: 'Mod-y', run: parent(redo), preventDefault: true },
			{
				key: 'ArrowUp',
				run: (v) => {
					if (suggestOpen(v) || !onFirstLine(v)) return false;
					this.exit('up');
					return true;
				},
			},
			{
				key: 'ArrowDown',
				run: (v) => {
					if (suggestOpen(v) || !onLastLine(v)) return false;
					this.exit('down');
					return true;
				},
			},
			{
				key: 'ArrowLeft',
				run: (v) => {
					if (index === 0 || !atStart(v)) return false;
					this.focusColumn(index - 1, 'end');
					return true;
				},
			},
			{
				key: 'ArrowRight',
				run: (v) => {
					if (index === count - 1 || !atEnd(v)) return false;
					this.focusColumn(index + 1, 'start');
					return true;
				},
			},
			{
				key: 'Escape',
				run: (v) => {
					if (suggestOpen(v)) return false;
					this.exit('down');
					return true;
				},
			},
		];
	}
}

function cloneData(block: BlockData): BlockData {
	return {
		widths: block.widths ? [...block.widths] : null,
		title: block.title,
		columns: [...block.columns],
	};
}

/** Focuses a column of the block starting at `blockFrom`, once it is rendered. */
export function focusColumnAt(
	view: EditorView,
	blockFrom: number,
	index: number,
	edge: Edge,
): boolean {
	for (const controller of viewControllers.get(view) ?? []) {
		if (controller.range()?.from === blockFrom) {
			controller.focusColumn(index, edge);
			return true;
		}
	}
	return false;
}

/** Arrow keys in the note move into an adjacent column block. */
function enterKeys(): KeyBinding[] {
	const enter = (view: EditorView, direction: 'up' | 'down') => {
		const sel = view.state.selection.main;
		if (!sel.empty) return false;
		const doc = view.state.doc;
		const line = doc.lineAt(sel.head).number - 1;
		for (const range of blocksIn(doc)) {
			if (direction === 'down' && range.block.fromLine === line + 1) {
				return focusColumnAt(view, range.from, 0, 'start');
			}
			if (direction === 'up' && range.block.toLine === line - 1) {
				return focusColumnAt(view, range.from, 0, 'end');
			}
		}
		return false;
	};
	return [
		{ key: 'ArrowDown', run: (v) => enter(v, 'down') },
		{ key: 'ArrowUp', run: (v) => enter(v, 'up') },
	];
}

/**
 * Keeps a blank line after every column block in Live Preview. Without it, text
 * typed right below the block would be pulled into the last column by
 * markdown's lazy continuation.
 */
const keepSeparator = EditorState.transactionFilter.of((tr) => {
	if (!tr.docChanged || !(tr.startState.field(editorLivePreviewField, false) ?? false)) {
		return tr;
	}
	const doc = tr.newDoc;
	const inserts: number[] = [];
	for (const range of blocksIn(doc)) {
		const next = range.block.toLine + 2;
		if (next <= doc.lines && doc.line(next).text.trim() !== '') {
			inserts.push(range.to);
		}
	}
	if (inserts.length === 0) return tr;
	return [
		tr,
		{
			changes: inserts.map((pos) => ({ from: pos, insert: '\n' })),
			sequential: true,
		},
	];
});

export function columnsEditorExtension(app: App): Extension {
	return [
		Prec.highest(buildField(app)),
		keepSeparator,
		Prec.high(keymap.of(enterKeys())),
	];
}
