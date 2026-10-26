import { describe, expect, it } from 'vitest';
import {
	addColumn,
	createColumnBlock,
	findColumnBlocks,
	minimalChange,
	parseWidths,
	removeColumn,
	resizeColumns,
	serializeColumnBlock,
	unwrapColumns,
} from './model';

const lines = (s: string) => s.split('\n');

const DOC = `Intro, full width.

> [!columns|40 60]
> ## Option A
> - fast
> - cheap
>
> > [!column-break]
>
> ## Option B
>
> - slow

Back to full width.`;

describe('findColumnBlocks', () => {
	it('parses columns, widths and line range', () => {
		const [block, ...rest] = findColumnBlocks(lines(DOC));
		expect(rest).toEqual([]);
		expect(block).toEqual({
			fromLine: 2,
			toLine: 11,
			widths: [40, 60],
			title: '',
			columns: ['## Option A\n- fast\n- cheap', '## Option B\n\n- slow'],
		});
	});

	it('round-trips through serialize', () => {
		const doc = lines(DOC);
		const block = findColumnBlocks(doc)[0]!;
		expect(serializeColumnBlock(block)).toBe(
			doc.slice(block.fromLine, block.toLine + 1).join('\n'),
		);
	});

	it('ignores blocks inside fenced code', () => {
		const doc = '```\n> [!columns]\n> a\n```\n';
		expect(findColumnBlocks(lines(doc))).toEqual([]);
	});

	it('does not split on a break inside a fenced code block in a column', () => {
		const doc = '> [!columns]\n> ```\n> > [!column-break]\n> ```\n';
		const block = findColumnBlocks(lines(doc))[0]!;
		expect(block.columns).toEqual(['```\n> [!column-break]\n```']);
	});

	it('keeps nested callouts and quotes inside a column', () => {
		const doc = '> [!columns]\n> > [!note]\n> > hi\n>\n> > [!column-break]\n>\n> b';
		const block = findColumnBlocks(lines(doc))[0]!;
		expect(block.columns).toEqual(['> [!note]\n> hi', 'b']);
		expect(serializeColumnBlock(block)).toBe(doc);
	});

	it('keeps callouts at the start, middle, and end of columns', () => {
		const doc = [
			'> [!columns]',
			'> > [!tip] Why',
			'> > Cheap.',
			'>',
			'> - step',
			'>',
			'> > [!column-break]',
			'>',
			'> > [!warning]- Risks',
			'> > Needs sign-off.',
			'>',
			'> > [!note]',
			'> > Deeper:',
			'> > > [!quote]',
			'> > > A quote.',
		].join('\n');
		const block = findColumnBlocks(lines(doc))[0]!;
		expect(block.columns).toEqual([
			'> [!tip] Why\n> Cheap.\n\n- step',
			'> [!warning]- Risks\n> Needs sign-off.\n\n> [!note]\n> Deeper:\n> > [!quote]\n> > A quote.',
		]);
		expect(serializeColumnBlock(block)).toBe(doc);
	});

	it('does not split on a column-break nested inside another callout', () => {
		const doc = '> [!columns]\n> > [!note]\n> > > [!column-break]\n> > text';
		const block = findColumnBlocks(lines(doc))[0]!;
		expect(block.columns).toEqual(['> [!note]\n> > [!column-break]\n> text']);
	});

	it('handles empty columns', () => {
		const doc = createColumnBlock(3);
		const block = findColumnBlocks(lines(doc))[0]!;
		expect(block.columns).toEqual(['', '', '']);
		expect(serializeColumnBlock(block)).toBe(doc);
	});

	it('finds multiple blocks', () => {
		const doc = `${createColumnBlock(2)}\n\ntext\n\n${createColumnBlock(3)}`;
		const blocks = findColumnBlocks(lines(doc));
		expect(blocks.map((b) => b.columns.length)).toEqual([2, 3]);
	});

	it('preserves title text and fold marker', () => {
		const doc = '> [!columns]- Compare\n> a';
		const block = findColumnBlocks(lines(doc))[0]!;
		expect(block.title).toBe('- Compare');
		expect(serializeColumnBlock(block)).toBe(doc);
	});
});

describe('parseWidths', () => {
	it('accepts spaces, commas and slashes', () => {
		expect(parseWidths('30 70')).toEqual([30, 70]);
		expect(parseWidths('30,70')).toEqual([30, 70]);
		expect(parseWidths('30/70')).toEqual([30, 70]);
	});
	it('rejects invalid input', () => {
		expect(parseWidths('')).toBeNull();
		expect(parseWidths('wide 70')).toBeNull();
		expect(parseWidths('0 100')).toBeNull();
	});
	it('drops widths that do not match the column count', () => {
		const block = { widths: [50, 50], title: '', columns: ['a', 'b', 'c'] };
		expect(serializeColumnBlock(block)).not.toContain('|');
	});
});

describe('column operations', () => {
	const block = { widths: [30, 70], title: '', columns: ['a', 'b'] };

	it('addColumn appends an empty column and resets widths', () => {
		expect(addColumn(block)).toEqual({
			widths: null,
			title: '',
			columns: ['a', 'b', ''],
		});
	});

	it('removeColumn merges content into its neighbor', () => {
		expect(removeColumn(block).columns).toEqual(['a\n\nb']);
		expect(removeColumn(block, 0).columns).toEqual(['b\n\na']);
		expect(removeColumn({ ...block, columns: ['a', ''] }).columns).toEqual([
			'a',
		]);
	});

	it('removeColumn keeps at least one column', () => {
		const one = { widths: null, columns: ['a'] };
		expect(removeColumn(one)).toBe(one);
	});

	it('unwrapColumns joins content', () => {
		expect(unwrapColumns({ columns: ['a', '', 'c'] })).toBe('a\n\nc');
	});

	it('createColumnBlock puts initial text in the first column', () => {
		const block = findColumnBlocks(lines(createColumnBlock(2, 'x\ny')))[0]!;
		expect(block.columns).toEqual(['x\ny', '']);
	});
});

describe('resizeColumns', () => {
	it('moves a divider and sums to 100', () => {
		expect(resizeColumns(null, 3, 0, 20)).toEqual([20, 47, 33]);
		expect(resizeColumns([40, 60], 2, 0, 55)).toEqual([55, 45]);
	});
	it('clamps to minimum width', () => {
		expect(resizeColumns(null, 2, 0, 2)).toEqual([10, 90]);
		expect(resizeColumns(null, 2, 0, 99)).toEqual([90, 10]);
	});
});

describe('minimalChange', () => {
	it('returns null for equal strings', () => {
		expect(minimalChange('abc', 'abc')).toBeNull();
	});
	it('replaces only the differing middle', () => {
		expect(minimalChange('> a\n> b', '> a\n> xb')).toEqual({
			from: 6,
			to: 6,
			insert: 'x',
		});
		expect(minimalChange('hello world', 'hello')).toEqual({
			from: 5,
			to: 11,
			insert: '',
		});
	});
});
