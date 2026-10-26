import { MarkdownPostProcessor } from 'obsidian';
import { normalizeWidths, parseWidths } from './model';

export function applyWidths(columnEls: HTMLElement[], widths: number[] | null) {
	const normalized = normalizeWidths(widths, columnEls.length);
	// Grow factors rather than percentages so gaps and dividers never overflow.
	columnEls.forEach((col, i) => {
		col.setCssProps({ '--bc-grow': normalized ? String(normalized[i]) : '' });
	});
}

/** Rearranges a rendered `[!columns]` callout into side-by-side columns. */
function layoutCallout(callout: HTMLElement) {
	if (callout.hasClass('bc-columns-callout')) return;
	const content = callout.querySelector<HTMLElement>(':scope > .callout-content');
	if (!content) return;

	const container = createDiv({ cls: 'bc-columns' });
	const columnEls: HTMLElement[] = [];
	let current = container.createDiv({ cls: 'bc-column' });
	columnEls.push(current);

	for (const child of Array.from(content.children)) {
		if (
			child.instanceOf(HTMLElement) &&
			child.matches('.callout[data-callout="column-break"]')
		) {
			child.remove();
			current = container.createDiv({ cls: 'bc-column' });
			columnEls.push(current);
		} else {
			current.appendChild(child);
		}
	}

	applyWidths(columnEls, parseWidths(callout.dataset.calloutMetadata));
	content.empty();
	content.appendChild(container);
	callout.addClass('bc-columns-callout');
}

export const columnsPostProcessor: MarkdownPostProcessor = (el) => {
	const callouts = el.matches('.callout[data-callout="columns"]')
		? [el]
		: Array.from(
				el.querySelectorAll<HTMLElement>('.callout[data-callout="columns"]'),
			);
	callouts.forEach(layoutCallout);
};
