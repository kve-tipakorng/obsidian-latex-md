import {
	App,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

// Named after the LaTeX document class each one approximates.
type Template = "ieeetran" | "article";
type BaseFontSize = "10pt" | "11pt" | "12pt";
type PaperSize = "letter" | "a4";

interface LatexLookSettings {
	template: Template;
	titleBlock: boolean;
	baseFontSize: BaseFontSize;
	paperSize: PaperSize;
}

const DEFAULT_SETTINGS: LatexLookSettings = {
	template: "ieeetran",
	titleBlock: false,
	baseFontSize: "10pt",
	paperSize: "letter",
};

const TEMPLATE_NAMES: Record<Template, string> = {
	ieeetran: "IEEEtran",
	article: "article",
};

// article: roughly 1 inch / 25mm margins, per LaTeX article defaults for
// each paper size. IEEEtran: approximately the journal-mode text block
// (43pc wide), which sits much closer to the paper edge.
const PAGE_SPECS: Record<
	Template,
	Record<PaperSize, { size: string; margin: string }>
> = {
	ieeetran: {
		letter: { size: "letter", margin: "0.75in 0.67in" },
		a4: { size: "A4", margin: "19mm 14mm 30mm 14mm" },
	},
	article: {
		letter: { size: "letter", margin: "1in" },
		a4: { size: "A4", margin: "25mm" },
	},
};

const BODY_EXPORTING_CLASS = "latex-look-exporting";
const BODY_TITLE_BLOCK_CLASS = "latex-look-title-block-enabled";
const PRINT_STYLE_EL_ID = "latex-look-print-page-style";
const BODY_TEMPLATE_CLASS_PREFIX = "latex-look-template-";
const TITLE_BLOCK_CLASS = "latex-look-title-block";
const DOC_TITLE_CLASS = "latex-look-doc-title";

// Defensive fallback only - the real cleanup triggers are the print
// window closing (export finished) or the export dialog being dismissed
// (export cancelled). This just guarantees the plugin can never get
// permanently stuck in export-styled state if neither is ever observed.
const EXPORT_SAFETY_TIMEOUT_MS = 5 * 60 * 1000;

// Obsidian opens its print window synchronously when the export dialog
// is confirmed, but only renders the note into it (which is what the
// post-processor sees) a little later. If the dialog has gone and no
// print render shows up within this window, the export was cancelled.
const EXPORT_CANCEL_GRACE_MS = 2000;
const PRINT_WINDOW_POLL_MS = 200;

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
	private exportingView: MarkdownView | null = null;
	/** Mode the note was in before the export forced Reading view. */
	private modeBeforeExport: string | null = null;
	private printWindowSeen = false;
	private modalObserver: MutationObserver | null = null;
	private cancelGraceTimeoutId: number | null = null;
	private printWindowPollId: number | null = null;
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
		this.finishExport();
		this.printStyleEl?.remove();
		this.printStyleEl = null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		if (!(this.settings.template in TEMPLATE_NAMES)) {
			this.settings.template = DEFAULT_SETTINGS.template;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Entry point for the export command. Switches the active view to
	 * Reading view if needed, applies the LaTeX-look export styling,
	 * forces a re-render so the title-block post-processor runs while
	 * `this.exporting` is true, then locates and triggers Obsidian's own
	 * "Export to PDF" command. Cleanup (reverting styling and the view
	 * mode) happens as soon as the export finishes or is cancelled - see
	 * `registerExportCleanup`.
	 */
	private async exportCurrentNoteAsPdf(view: MarkdownView): Promise<void> {
		if (!view) {
			const active = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!active) return;
			view = active;
		}

		// A previous export that was never observed finishing must not
		// leak its state into this one.
		this.finishExport();

		const previousMode = view.getMode();
		if (previousMode !== "preview") {
			await view.setState(
				{ ...view.getState(), mode: "preview" },
				{ history: false }
			);
		}

		this.exporting = true;
		this.exportingView = view;
		this.modeBeforeExport = previousMode;
		this.printWindowSeen = false;
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
			this.finishExport();
			return;
		}

		const modalsBefore = new Set(this.openModals());
		(this.app as any).commands.executeCommandById(exportCommandId);
		this.registerExportCleanup(modalsBefore);
	}

	private openModals(): Element[] {
		return Array.from(
			document.body.querySelectorAll(":scope > .modal-container")
		);
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
	 * Obsidian's export has no completion callback, so the two ways it
	 * can end are observed directly:
	 *
	 * - Finished: Obsidian renders the note into a separate hidden print
	 *   window and closes that window once the PDF is written. The
	 *   post-processor notices the render happening in a foreign window
	 *   (`watchPrintWindow`) and cleanup runs when that window closes.
	 * - Cancelled: the export dialog goes away and no print render
	 *   follows within EXPORT_CANCEL_GRACE_MS.
	 *
	 * The styling has to stay on the main window's <body> until then,
	 * because Obsidian mirrors the main window's body classes into the
	 * print window. A timeout backstops both in case neither is seen.
	 */
	private registerExportCleanup(modalsBefore: Set<Element>): void {
		this.clearPendingExportCleanup();

		const findExportModal = (): Element | null =>
			this.openModals().find((el) => !modalsBefore.has(el)) ?? null;
		let exportModal = findExportModal();

		const onModalGone = (): void => {
			this.modalObserver?.disconnect();
			this.modalObserver = null;
			this.cancelGraceTimeoutId = window.setTimeout(() => {
				this.cancelGraceTimeoutId = null;
				if (!this.printWindowSeen) this.finishExport();
			}, EXPORT_CANCEL_GRACE_MS);
		};

		// The dialog normally exists already, but is picked up here too
		// in case Obsidian opens it a tick after the command returns.
		this.modalObserver = new MutationObserver(() => {
			exportModal ??= findExportModal();
			if (exportModal && !exportModal.isConnected) onModalGone();
		});
		this.modalObserver.observe(document.body, { childList: true });

		this.exportSafetyTimeoutId = window.setTimeout(() => {
			this.finishExport();
		}, EXPORT_SAFETY_TIMEOUT_MS);
	}

	/**
	 * Called from the post-processor when a render of the exported note
	 * happens in a window other than the main one, i.e. Obsidian's print
	 * window. Reverts the export once that window has closed.
	 */
	private watchPrintWindow(printWindow: Window): void {
		if (this.printWindowSeen) return;
		this.printWindowSeen = true;
		this.printWindowPollId = window.setInterval(() => {
			if (printWindow.closed) this.finishExport();
		}, PRINT_WINDOW_POLL_MS);
	}

	private clearPendingExportCleanup(): void {
		this.modalObserver?.disconnect();
		this.modalObserver = null;
		if (this.cancelGraceTimeoutId !== null) {
			window.clearTimeout(this.cancelGraceTimeoutId);
			this.cancelGraceTimeoutId = null;
		}
		if (this.printWindowPollId !== null) {
			window.clearInterval(this.printWindowPollId);
			this.printWindowPollId = null;
		}
		if (this.exportSafetyTimeoutId !== null) {
			window.clearTimeout(this.exportSafetyTimeoutId);
			this.exportSafetyTimeoutId = null;
		}
	}

	/**
	 * Reverts export styling, strips any title block left injected in the
	 * exported note's DOM, and puts that view back the way it was: the
	 * mode it was in before the export, or a fresh re-render if it was
	 * already in Reading view. Safe to call when no export is active.
	 */
	private finishExport(): void {
		const view = this.exportingView;
		const previousMode = this.modeBeforeExport;

		this.clearPendingExportCleanup();
		this.exporting = false;
		this.exportingView = null;
		this.modeBeforeExport = null;
		this.printWindowSeen = false;
		this.clearExportStyling();

		if (!view) return;
		this.removeInjectedTitleBlocks(view);
		if (previousMode && previousMode !== "preview") {
			void view.setState(
				{ ...view.getState(), mode: previousMode },
				{ history: false }
			);
		} else {
			this.rerenderView(view);
		}
	}

	/**
	 * Push the current settings out as CSS custom properties / body
	 * classes so styles.css applies the LaTeX-look export styling. Only
	 * ever called for the duration of the export command - never at
	 * plugin load, and never persists past `finishExport`.
	 */
	private applyExportStyling(): void {
		const body = document.body;
		body.classList.add(
			BODY_EXPORTING_CLASS,
			BODY_TEMPLATE_CLASS_PREFIX + this.settings.template
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
			BODY_TITLE_BLOCK_CLASS,
			...Object.keys(TEMPLATE_NAMES).map(
				(id) => BODY_TEMPLATE_CLASS_PREFIX + id
			)
		);
		body.style.removeProperty("--latex-look-font-size");
	}

	/**
	 * @page size/margin cannot be driven by CSS custom properties in
	 * Chromium (the engine behind Obsidian's Export to PDF), so instead we
	 * inject a tiny dedicated <style> element with a literal @page rule,
	 * written fresh each time an export starts based on the current
	 * template and paper-size settings.
	 */
	private updatePrintPageStyle(): void {
		const specs = PAGE_SPECS[this.settings.template];
		const spec = specs[this.settings.paperSize] ?? specs.letter;
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
		view.containerEl
			.querySelectorAll(`.${DOC_TITLE_CLASS}`)
			.forEach((el) => el.classList.remove(DOC_TITLE_CLASS));
	}

	/**
	 * Frontmatter stays out of the export by default, so in every
	 * template the note's first H1 is set as the document title. CSS cannot pick out "the first H1 of the document" across
	 * Obsidian's per-section wrappers, so it is tagged here.
	 *
	 * Obsidian's print render hands over the whole document at once (and
	 * has no section info), so the first H1 in it is the one. Reading
	 * view renders section by section in no guaranteed order, so there
	 * the section is matched against the first H1's line in the
	 * metadata cache instead.
	 */
	private markDocumentTitle(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): void {
		const section = ctx.getSectionInfo(el);

		// Print render with "Include file name as title" ticked in
		// Obsidian's export dialog: the file name is added as an H1
		// sitting directly in the container, ahead of the note's own
		// blocks (which are each wrapped in a div). The note's H1 is the
		// title, so the file-name heading is dropped when both exist.
		if (!section) {
			const fileNameH1 = el.querySelector(":scope > h1");
			if (fileNameH1 && el.querySelector(":scope > div h1")) {
				fileNameH1.remove();
			}
		}

		const h1 = el.querySelector("h1");
		if (!h1) return;

		if (section) {
			const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(file instanceof TFile)) return;
			const firstH1 = this.app.metadataCache
				.getFileCache(file)
				?.headings?.find((heading) => heading.level === 1);
			if (firstH1?.position.start.line !== section.lineStart) return;
		}

		h1.classList.add(DOC_TITLE_CLASS);
	}

	/**
	 * Markdown post-processor implementing the \maketitle-style title
	 * block. A no-op unless the plugin is actively exporting. Also the
	 * place the export's print window is detected, since this runs for
	 * every render of the note, including Obsidian's print render. Reads
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

		const renderWindow = el.ownerDocument.defaultView;
		if (renderWindow && renderWindow !== window) {
			this.watchPrintWindow(renderWindow);
		}

		this.markDocumentTitle(el, ctx);

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
			.setName("Template")
			.setDesc(
				"The LaTeX document class the exported PDF is styled after. IEEEtran: IEEE Transactions look in a single column - Times, the note's first H1 as the paper title, centered small-caps section headings. article: the classic LaTeX article look in Latin Modern. Both use the note's first H1 as the title."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(TEMPLATE_NAMES)
					.setValue(this.plugin.settings.template)
					.onChange(async (value) => {
						this.plugin.settings.template = value as Template;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Title block from frontmatter")
			.setDesc(
				"Off by default, so nothing from a note's YAML properties appears in the exported PDF. Turn on to render a \\maketitle-style block (title, subtitle, author, date) at the top, for notes that have matching frontmatter fields."
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
				"Matches the LaTeX class options (10pt / 11pt / 12pt), used for the exported PDF. Both classes default to 10pt."
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
