import { describe, expect, it } from 'vitest';
import { blockBehindBackspace } from './model';

const lines = (s: string) => s.split('\n');

const DOC = `Intro, full width.

> [!columns]
> Left
>
> > [!column-break]
>
> Right

Back to full width.`;

describe('blockBehindBackspace', () => {
	const doc = lines(DOC);
	const end = doc[7]!.length;

	it('finds the block from right after it, the blank line, or the text below', () => {
		expect(blockBehindBackspace(doc, 7, end)?.fromLine).toBe(2);
		expect(blockBehindBackspace(doc, 8, 0)?.fromLine).toBe(2);
		expect(blockBehindBackspace(doc, 9, 0)?.fromLine).toBe(2);
	});

	it('leaves ordinary backspaces alone', () => {
		expect(blockBehindBackspace(doc, 9, 4)).toBeNull();
		expect(blockBehindBackspace(doc, 7, 2)).toBeNull();
	});

	it('still deletes extra blank lines below the block', () => {
		const extra = lines(DOC.replace('\n\nBack', '\n\n\nBack'));
		expect(blockBehindBackspace(extra, 9, 0)).toBeNull();
		expect(blockBehindBackspace(extra, 8, 0)?.fromLine).toBe(2);
	});
});
