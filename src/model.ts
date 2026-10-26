// Pure parsing/serialization of column blocks. No Obsidian imports so it can
// be unit tested in isolation.
//
// Format:
//   > [!columns|40 60]
//   > column one
//   >
//   > > [!column-break]
//   >
//   > column two

export interface ColumnBlock {
	/** 0-based index of the `> [!columns]` header line. */
	fromLine: number;
	/** 0-based index of the last line of the block (inclusive). */
	toLine: number;
	/** Column widths in percent, or null for equal widths. */
	widths: number[] | null;
	/** Text after the header marker, preserved verbatim. */
	title: string;
	/** Column contents with one level of `> ` stripped. */
	columns: string[];
}

export const MIN_WIDTH = 10;

const HEADER_RE = /^>\s*\[!columns(?:\|([^\]]*))?\]([+-]?)(.*)$/i;
const BREAK_RE = /^>\s*\[!column-break\]/i;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

export function isHeaderLine(line: string): boolean {
	return HEADER_RE.test(line);
}

export function parseWidths(meta: string | undefined | null): number[] | null {
	if (!meta) return null;
	const parts = meta.trim().split(/[\s,/]+/).filter(Boolean);
	if (parts.length === 0) return null;
	const nums = parts.map(Number);
	if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
	return nums;
}

/** Returns widths scaled to sum to 100, or null if they don't fit the column count. */
export function normalizeWidths(
	widths: number[] | null,
	count: number,
): number[] | null {
	if (!widths || widths.length !== count) return null;
	const sum = widths.reduce((a, b) => a + b, 0);
	return widths.map((w) => (w / sum) * 100);
}

function stripQuote(line: string): string {
	return line.replace(/^> ?/, '');
}

function trimBlankLines(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]!.trim() === '') start++;
	while (end > start && lines[end - 1]!.trim() === '') end--;
	return lines.slice(start, end);
}

function parseBlock(lines: string[], fromLine: number): ColumnBlock {
	const header = HEADER_RE.exec(lines[fromLine]!)!;
	let toLine = fromLine;
	while (toLine + 1 < lines.length && lines[toLine + 1]!.startsWith('>')) {
		toLine++;
	}

	const columns: string[] = [];
	let current: string[] = [];
	let fence: string | null = null;
	for (let i = fromLine + 1; i <= toLine; i++) {
		const inner = stripQuote(lines[i]!);
		const fenceMatch = FENCE_RE.exec(inner);
		if (fence) {
			if (fenceMatch && fenceMatch[1]!.startsWith(fence)) fence = null;
		} else if (fenceMatch) {
			fence = fenceMatch[1]!;
		} else if (BREAK_RE.test(inner)) {
			columns.push(trimBlankLines(current).join('\n'));
			current = [];
			continue;
		}
		current.push(inner);
	}
	columns.push(trimBlankLines(current).join('\n'));

	return {
		fromLine,
		toLine,
		widths: parseWidths(header[1]),
		title: (header[2] ?? '') + (header[3] ?? ''),
		columns,
	};
}

/** Finds all top-level column blocks, skipping ones inside fenced code. */
export function findColumnBlocks(lines: string[]): ColumnBlock[] {
	const blocks: ColumnBlock[] = [];
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const fenceMatch = FENCE_RE.exec(line);
		if (fence) {
			if (fenceMatch && fenceMatch[1]!.startsWith(fence)) fence = null;
			continue;
		}
		if (fenceMatch) {
			fence = fenceMatch[1]!;
			continue;
		}
		if (isHeaderLine(line)) {
			const block = parseBlock(lines, i);
			blocks.push(block);
			i = block.toLine;
		}
	}
	return blocks;
}

/** Finds the block whose line range contains `line`, if any. */
export function findBlockAt(
	lines: string[],
	line: number,
): ColumnBlock | null {
	return (
		findColumnBlocks(lines).find(
			(b) => b.fromLine <= line && line <= b.toLine,
		) ?? null
	);
}

function formatWidths(widths: number[] | null, count: number): string {
	if (!widths || widths.length !== count) return '';
	return '|' + widths.map((w) => Math.round(w)).join(' ');
}

export function serializeColumnBlock(
	block: Pick<ColumnBlock, 'widths' | 'title' | 'columns'>,
): string {
	const out = [
		`> [!columns${formatWidths(block.widths, block.columns.length)}]${block.title}`,
	];
	block.columns.forEach((col, i) => {
		if (i > 0) out.push('>', '> > [!column-break]', '>');
		if (col === '') return;
		for (const line of col.split('\n')) {
			out.push(line === '' ? '>' : '> ' + line);
		}
	});
	return out.join('\n');
}

export function createColumnBlock(count: number, first = ''): string {
	const columns = Array.from({ length: count }, (_, i) =>
		i === 0 ? first : '',
	);
	return serializeColumnBlock({ widths: null, title: '', columns });
}

export function addColumn<T extends Pick<ColumnBlock, 'widths' | 'columns'>>(
	block: T,
): T {
	return { ...block, widths: null, columns: [...block.columns, ''] };
}

/** Removes column `index`, merging its text into a neighbor so nothing is lost. */
export function removeColumn<
	T extends Pick<ColumnBlock, 'widths' | 'columns'>,
>(block: T, index = block.columns.length - 1): T {
	if (block.columns.length <= 1) return block;
	const columns = [...block.columns];
	const [removed] = columns.splice(index, 1);
	const target = index === 0 ? 0 : index - 1;
	if (removed) {
		columns[target] = [columns[target], removed]
			.filter((s) => s !== '')
			.join('\n\n');
	}
	return { ...block, widths: null, columns };
}

/** Joins all columns into plain (un-columned) markdown. */
export function unwrapColumns(block: Pick<ColumnBlock, 'columns'>): string {
	return block.columns.filter((c) => c !== '').join('\n\n');
}

/**
 * Moves the divider between column `index` and `index + 1` so the left column
 * gets `leftPercent` of their combined width.
 */
export function resizeColumns(
	widths: number[] | null,
	count: number,
	index: number,
	leftPercent: number,
): number[] {
	const base = normalizeWidths(widths, count) ?? Array<number>(count).fill(100 / count);
	const pair = base[index]! + base[index + 1]!;
	const left = Math.min(Math.max(leftPercent, MIN_WIDTH), pair - MIN_WIDTH);
	const out = [...base];
	out[index] = left;
	out[index + 1] = pair - left;
	return roundTo100(out);
}

function roundTo100(widths: number[]): number[] {
	const rounded = widths.map((w) => Math.round(w));
	const diff = 100 - rounded.reduce((a, b) => a + b, 0);
	rounded[rounded.length - 1]! += diff;
	return rounded;
}

/** Smallest single replacement turning `before` into `after`, or null if equal. */
export function minimalChange(before: string, after: string) {
	if (before === after) return null;
	let start = 0;
	const max = Math.min(before.length, after.length);
	while (start < max && before[start] === after[start]) start++;
	let end = 0;
	while (
		end < max - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]
	) {
		end++;
	}
	return {
		from: start,
		to: before.length - end,
		insert: after.slice(start, after.length - end),
	};
}
