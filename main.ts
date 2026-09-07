import { Plugin } from "obsidian";

type BaseFontSize = "10pt" | "11pt" | "12pt";
type PaperSize = "letter" | "a4";

interface LatexLookSettings {
	headingNumbering: boolean;
	titleBlock: boolean;
	baseFontSize: BaseFontSize;
	paperSize: PaperSize;
}

const DEFAULT_SETTINGS: LatexLookSettings = {
	headingNumbering: true,
	titleBlock: true,
	baseFontSize: "11pt",
	paperSize: "letter",
};

// Roughly 1 inch / 25mm margins, per LaTeX article defaults for each paper size.
const PAGE_SPECS: Record<PaperSize, { size: string; margin: string }> = {
	letter: { size: "letter", margin: "1in" },
	a4: { size: "A4", margin: "25mm" },
};

const BODY_HEADING_NUMBERS_CLASS = "latex-look-heading-numbers";
const BODY_TITLE_BLOCK_CLASS = "latex-look-title-block-enabled";
const PRINT_STYLE_EL_ID = "latex-look-print-page-style";

export default class LatexLookPlugin extends Plugin {
	settings: LatexLookSettings;
	private printStyleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applySettings();
	}

	onunload(): void {
		const body = document.body;
		body.classList.remove(BODY_HEADING_NUMBERS_CLASS, BODY_TITLE_BLOCK_CLASS);
		body.style.removeProperty("--latex-look-font-size");
		this.printStyleEl?.remove();
		this.printStyleEl = null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Push the current settings out as CSS custom properties / body classes
	 * so styles.css can react to them instantly.
	 */
	applySettings(): void {
		const body = document.body;
		body.classList.toggle(
			BODY_HEADING_NUMBERS_CLASS,
			this.settings.headingNumbering
		);
		body.classList.toggle(BODY_TITLE_BLOCK_CLASS, this.settings.titleBlock);
		body.style.setProperty(
			"--latex-look-font-size",
			this.settings.baseFontSize
		);
		this.updatePrintPageStyle();
	}

	/**
	 * @page size/margin cannot be driven by CSS custom properties in
	 * Chromium (the engine behind Obsidian's Export to PDF), so instead we
	 * inject a tiny dedicated <style> element with a literal @page rule and
	 * rewrite its contents whenever the paper-size setting changes.
	 */
	private updatePrintPageStyle(): void {
		const spec = PAGE_SPECS[this.settings.paperSize] ?? PAGE_SPECS.letter;
		if (!this.printStyleEl) {
			this.printStyleEl = document.createElement("style");
			this.printStyleEl.id = PRINT_STYLE_EL_ID;
			document.head.appendChild(this.printStyleEl);
		}
		this.printStyleEl.textContent = `@media print {\n  @page {\n    size: ${spec.size};\n    margin: ${spec.margin};\n  }\n}`;
	}
}
