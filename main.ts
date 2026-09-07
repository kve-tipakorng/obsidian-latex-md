import {
	App,
	MarkdownPostProcessorContext,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

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
const TITLE_BLOCK_CLASS = "latex-look-title-block";

export default class LatexLookPlugin extends Plugin {
	settings: LatexLookSettings;
	private printStyleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applySettings();

		this.registerMarkdownPostProcessor(
			this.titleBlockPostProcessor.bind(this)
		);

		this.addSettingTab(new LatexLookSettingTab(this.app, this));
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

	/**
	 * Force every open reading-view leaf to fully re-render. Only needed
	 * when a setting changes what DOM gets injected (the title block) -
	 * pure CSS settings apply instantly without this.
	 */
	rerenderOpenNotes(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.getMode() === "preview") {
				const preview = view.previewMode as unknown as {
					rerender?: (full: boolean) => void;
				};
				preview.rerender?.(true);
			}
		}
	}

	/**
	 * Markdown post-processor implementing the \maketitle-style title
	 * block. Reads title/subtitle/author/date from the file's frontmatter
	 * (via the metadata cache, not by re-parsing the rendered chunk) and
	 * prepends a styled block to the reading-view container the first
	 * time any chunk of the note is rendered. Guarded so it never
	 * duplicates on subsequent partial re-renders of the same note.
	 */
	private titleBlockPostProcessor(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): void {
		if (!this.settings.titleBlock) return;

		const container = el.parentElement;
		if (!container) return;

		// Already inserted for this render of this container - skip.
		if (container.querySelector(`:scope > .${TITLE_BLOCK_CLASS}`)) return;

		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const frontmatter = this.app.metadataCache.getFileCache(file)
			?.frontmatter as Record<string, unknown> | undefined;
		if (!frontmatter) return;

		const { title, subtitle, author, date } = frontmatter;
		if (!title && !subtitle && !author && !date) return;

		const block = document.createElement("div");
		block.className = TITLE_BLOCK_CLASS;

		if (title) {
			block.createDiv({ cls: "latex-look-title" }).setText(String(title));
		}
		if (subtitle) {
			block
				.createDiv({ cls: "latex-look-subtitle" })
				.setText(String(subtitle));
		}
		if (author || date) {
			const meta = block.createDiv({ cls: "latex-look-meta" });
			if (author) {
				meta
					.createDiv({ cls: "latex-look-author" })
					.setText(Array.isArray(author) ? author.join(", ") : String(author));
			}
			if (date) {
				meta.createDiv({ cls: "latex-look-date" }).setText(String(date));
			}
		}

		container.insertBefore(block, container.firstChild);
	}
}

class LatexLookSettingTab extends PluginSettingTab {
	plugin: LatexLookPlugin;

	constructor(app: App, plugin: LatexLookPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "LaTeX Look" });
		containerEl.createEl("p", {
			text:
				"Typography settings for the LaTeX article-style Reading view and PDF export.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Automatic heading numbering")
			.setDesc(
				"Number headings like LaTeX \\section / \\subsection (1, 1.1, 1.1.1, ...)."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.headingNumbering)
					.onChange(async (value) => {
						this.plugin.settings.headingNumbering = value;
						await this.plugin.saveSettings();
						this.plugin.applySettings();
					})
			);

		new Setting(containerEl)
			.setName("Title block from frontmatter")
			.setDesc(
				"Render a \\maketitle-style block (title, subtitle, author, date) at the top of notes that have matching frontmatter fields."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.titleBlock)
					.onChange(async (value) => {
						this.plugin.settings.titleBlock = value;
						await this.plugin.saveSettings();
						this.plugin.applySettings();
						this.plugin.rerenderOpenNotes();
					})
			);

		new Setting(containerEl)
			.setName("Base font size")
			.setDesc(
				"Matches the LaTeX article class options (10pt / 11pt / 12pt)."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ "10pt": "10pt", "11pt": "11pt", "12pt": "12pt" })
					.setValue(this.plugin.settings.baseFontSize)
					.onChange(async (value) => {
						this.plugin.settings.baseFontSize = value as BaseFontSize;
						await this.plugin.saveSettings();
						this.plugin.applySettings();
					})
			);

		new Setting(containerEl)
			.setName("Paper size (print / export)")
			.setDesc(
				"Target page width and margin for @media print, used by Obsidian's Export to PDF. See the README for an important caveat about Obsidian's PDF export margin setting."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ letter: "Letter", a4: "A4" })
					.setValue(this.plugin.settings.paperSize)
					.onChange(async (value) => {
						this.plugin.settings.paperSize = value as PaperSize;
						await this.plugin.saveSettings();
						this.plugin.applySettings();
					})
			);
	}
}
