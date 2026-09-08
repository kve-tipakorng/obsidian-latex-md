import {
	App,
	EventRef,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
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

const BODY_EXPORTING_CLASS = "latex-look-exporting";
const BODY_HEADING_NUMBERS_CLASS = "latex-look-heading-numbers";
const BODY_TITLE_BLOCK_CLASS = "latex-look-title-block-enabled";
const PRINT_STYLE_EL_ID = "latex-look-print-page-style";
const TITLE_BLOCK_CLASS = "latex-look-title-block";

// Defensive fallback only - the real cleanup trigger is the next
// "active-leaf-change" event. This just guarantees the plugin can never
// get permanently stuck in export-styled state if the user never
// switches notes/leaves after invoking the export command.
const EXPORT_SAFETY_TIMEOUT_MS = 5 * 60 * 1000;

export default class LatexLookPlugin extends Plugin {
	settings: LatexLookSettings;
	private printStyleEl: HTMLStyleElement | null = null;

	/**
	 * True only for the duration of the "Export current note as LaTeX-look
	 * PDF" command - from the moment it starts styling the active note
	 * until cleanup runs. Reading view is never styled outside this
	 * window, and the title-block post-processor is gated on this flag.
	 */
	private exporting = false;
	private exportingLeaf: WorkspaceLeaf | null = null;
	private activeLeafChangeRef: EventRef | null = null;
	private exportSafetyTimeoutId: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Registered once at load (Obsidian requires this), but its body
		// is gated on `this.exporting` - it is a no-op during normal
		// Reading view and only injects the title block while an export is
		// actively in progress.
		this.registerMarkdownPostProcessor(
			this.titleBlockPostProcessor.bind(this)
		);

		this.addCommand({
			id: "export-latex-look-pdf",
			name: "Export current note as LaTeX-look PDF",
			checkCallback: (checking: boolean): boolean => {
				const view =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;
				if (!checking) {
					void this.exportCurrentNoteAsPdf(view);
				}
				return true;
			},
		});

		this.addSettingTab(new LatexLookSettingTab(this.app, this));
	}

	onunload(): void {
		// Unconditional cleanup regardless of whether an export was in
		// progress or a cleanup listener/timeout was pending.
		this.clearPendingExportCleanup();
		this.clearExportStyling();
		this.exporting = false;
		this.exportingLeaf = null;
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
	 * Entry point for the export command. Switches the active view to
	 * Reading view if needed, applies the LaTeX-look export styling,
	 * forces a re-render so the title-block post-processor runs while
	 * `this.exporting` is true, then locates and triggers Obsidian's own
	 * "Export to PDF" command. Cleanup (reverting styling) happens on the
	 * next leaf change, or via a defensive timeout.
	 */
	private async exportCurrentNoteAsPdf(view: MarkdownView): Promise<void> {
		if (!view) {
			const active = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!active) return;
			view = active;
		}

		if (view.getMode() !== "preview") {
			await view.setState(
				{ ...view.getState(), mode: "preview" },
				{ history: false }
			);
		}

		this.exporting = true;
		this.exportingLeaf = view.leaf;
		this.applyExportStyling();

		this.rerenderView(view);
		// Let layout actually settle before invoking the export command.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => setTimeout(resolve, 50))
		);

		const exportCommandId = this.findExportToPdfCommandId();
		if (!exportCommandId) {
			new Notice(
				'LaTeX Look: could not find Obsidian\'s built-in "Export to PDF" command (the core plugin providing it may be disabled).'
			);
			this.finishExport(view);
			return;
		}

		(this.app as any).commands.executeCommandById(exportCommandId);
		this.registerExportCleanup(view);
	}

	/**
	 * Obsidian's "Export to PDF" command id is not reliably documented and
	 * can vary by version, so it's located dynamically by scanning the
	 * registered command list for something that looks like a PDF export
	 * command, rather than hardcoding an id.
	 */
	private findExportToPdfCommandId(): string | null {
		const commands = (this.app as any).commands?.commands as
			| Record<string, { id: string; name: string }>
			| undefined;
		if (!commands) return null;

		const pattern = /export.*pdf/i;
		for (const key of Object.keys(commands)) {
			const command = commands[key];
			if (
				command &&
				(pattern.test(command.id) || pattern.test(command.name))
			) {
				return command.id;
			}
		}
		return null;
	}

	/**
	 * Rather than guessing how long the user takes to interact with the
	 * native save dialog, cleanup is tied to the next time the workspace's
	 * active leaf changes (the user switching away from - or back to -
	 * the exported note). A timeout is registered alongside it purely as
	 * a defensive fallback in case that event never fires.
	 */
	private registerExportCleanup(view: MarkdownView): void {
		this.clearPendingExportCleanup();

		const onActiveLeafChange = (): void => {
			this.clearPendingExportCleanup();
			this.finishExport(view);
		};

		this.activeLeafChangeRef = this.app.workspace.on(
			"active-leaf-change",
			onActiveLeafChange
		);

		this.exportSafetyTimeoutId = window.setTimeout(() => {
			this.clearPendingExportCleanup();
			this.finishExport(view);
		}, EXPORT_SAFETY_TIMEOUT_MS);
	}

	private clearPendingExportCleanup(): void {
		if (this.activeLeafChangeRef) {
			this.app.workspace.offref(this.activeLeafChangeRef);
			this.activeLeafChangeRef = null;
		}
		if (this.exportSafetyTimeoutId !== null) {
			window.clearTimeout(this.exportSafetyTimeoutId);
			this.exportSafetyTimeoutId = null;
		}
	}

	/**
	 * Reverts export styling, strips any title block left injected in the
	 * exported note's DOM, and re-renders that view once more so it snaps
	 * back to plain Obsidian styling.
	 */
	private finishExport(view: MarkdownView | null): void {
		this.exporting = false;
		this.clearExportStyling();
		if (view) {
			this.removeInjectedTitleBlocks(view);
			this.rerenderView(view);
		}
		this.exportingLeaf = null;
	}

	/**
	 * Push the current settings out as CSS custom properties / body
	 * classes so styles.css applies the LaTeX-look export styling. Only
	 * ever called for the duration of the export command - never at
	 * plugin load, and never persists past `finishExport`.
	 */
	private applyExportStyling(): void {
		const body = document.body;
		body.classList.add(BODY_EXPORTING_CLASS);
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

	private clearExportStyling(): void {
		const body = document.body;
		body.classList.remove(
			BODY_EXPORTING_CLASS,
			BODY_HEADING_NUMBERS_CLASS,
			BODY_TITLE_BLOCK_CLASS
		);
		body.style.removeProperty("--latex-look-font-size");
	}

	/**
	 * @page size/margin cannot be driven by CSS custom properties in
	 * Chromium (the engine behind Obsidian's Export to PDF), so instead we
	 * inject a tiny dedicated <style> element with a literal @page rule,
	 * written fresh each time an export starts based on the current
	 * paper-size setting.
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
	 * Force a reading-view leaf to fully re-render. Used both to make the
	 * title-block post-processor run while `this.exporting` is true, and
	 * afterward to make it disappear again on cleanup. Guarded against a
	 * missing/renamed internal API.
	 */
	private rerenderView(view: MarkdownView): void {
		if (view.getMode() !== "preview") return;
		const preview = view.previewMode as unknown as {
			rerender?: (full: boolean) => void;
		};
		preview.rerender?.(true);
	}

	private removeInjectedTitleBlocks(view: MarkdownView): void {
		view.containerEl
			.querySelectorAll(`.${TITLE_BLOCK_CLASS}`)
			.forEach((el) => el.remove());
	}

	/**
	 * Markdown post-processor implementing the \maketitle-style title
	 * block. A no-op unless the plugin is actively exporting. Reads
	 * title/subtitle/author/date from the file's frontmatter (via the
	 * metadata cache, not by re-parsing the rendered chunk) and prepends a
	 * styled block to the reading-view container the first time any chunk
	 * of the note is rendered during that export. Guarded so it never
	 * duplicates on subsequent partial re-renders of the same note.
	 */
	private titleBlockPostProcessor(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): void {
		if (!this.exporting) return;
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
				'Typography settings used by the "Export current note as LaTeX-look PDF" command (Command Palette). These do not affect normal Reading view, and take effect the next time you run the export command.',
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Automatic heading numbering")
			.setDesc(
				"Number headings like LaTeX \\section / \\subsection (1, 1.1, 1.1.1, ...) in the exported PDF."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.headingNumbering)
					.onChange(async (value) => {
						this.plugin.settings.headingNumbering = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Title block from frontmatter")
			.setDesc(
				"Render a \\maketitle-style block (title, subtitle, author, date) at the top of the exported PDF, for notes that have matching frontmatter fields."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.titleBlock)
					.onChange(async (value) => {
						this.plugin.settings.titleBlock = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Base font size")
			.setDesc(
				"Matches the LaTeX article class options (10pt / 11pt / 12pt), used for the exported PDF."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ "10pt": "10pt", "11pt": "11pt", "12pt": "12pt" })
					.setValue(this.plugin.settings.baseFontSize)
					.onChange(async (value) => {
						this.plugin.settings.baseFontSize = value as BaseFontSize;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Paper size (export)")
			.setDesc(
				'Target page width and margin used when exporting via "Export current note as LaTeX-look PDF". See the README for an important caveat about Obsidian\'s PDF export margin setting.'
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ letter: "Letter", a4: "A4" })
					.setValue(this.plugin.settings.paperSize)
					.onChange(async (value) => {
						this.plugin.settings.paperSize = value as PaperSize;
						await this.plugin.saveSettings();
					})
			);
	}
}
