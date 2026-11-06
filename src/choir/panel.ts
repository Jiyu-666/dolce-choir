import type { App } from "../editor/app";
import { formatOf } from "../editor/formats";
import { openModal } from "../editor/dialogs";
import { saveBytes } from "../editor/fileio";
import { packProject } from "../editor/omrproject";
import { ScorePlayer } from "../editor/player";
import { loadScoreDoc } from "../model/fromxml";
import { scoreDocToMusicXml } from "../model/toxml";
import { playSourceOfDoc } from "../model/playdoc";
import { t, type MsgKey } from "../i18n";
import { enumerateLanes, ROLES, type MappingIssue, type ChoirRole } from "./mapping";
import { ChoirSession, setLane, sourceNoteChoices } from "./session";
import { packChoirProject, unpackChoirProject, type ChoirProject } from "./project";
import { loadChoirDraft, saveChoirDraft } from "./draft";
import "./panel.css";

const controllers = new WeakMap<App, ChoirPanel>();
export async function showChoirPanel(app: App): Promise<void> {
  let c = controllers.get(app);
  if (!c) { c = new ChoirPanel(app); controllers.set(app, c); }
  await c.open();
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.textContent = text; return e;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const b = element("button", text); b.type = "button"; b.addEventListener("click", action); return b;
}
const issueKeys: Record<MappingIssue["code"], MsgKey> = {
  revision: "choir.issue.revision", roles: "choir.issue.roles", "missing-lane": "choir.issue.missing",
  unconfirmed: "choir.issue.unconfirmed", polyphony: "choir.issue.polyphony", choice: "choir.issue.choice",
  overlap: "choir.issue.overlap", duplicate: "choir.issue.duplicate", mark: "choir.issue.mark",
  unsupported: "choir.issue.unsupported", unassigned: "choir.issue.unassigned",
};
class ChoirPanel {
  private session = new ChoirSession();
  private body: HTMLElement | null = null;
  private close: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private syncing = false;
  private sourceValid = false;
  private syncGeneration = 0;
  private restoring = false;
  private message = "";
  private openedDraft = false;
  private readonly player = new ScorePlayer(() => {}, () => {});
  constructor(private readonly app: App) {
    app.choirSourceChanged = (newDocument) => {
      if (this.restoring) return;
      if (newDocument) this.session.clear();
      this.player.stop(); this.syncing = true; this.sourceValid = false; this.render();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.sync(), 250);
    };
  }
  private sourceXml(): string {
    const doc = this.app.scoreDoc();
    if (!doc) throw new Error(t("choir.noScore"));
    return this.app.docFormat === "musicxml" ? this.app.getText() : scoreDocToMusicXml(doc, { sourceIds: true });
  }
  private async sync(): Promise<void> {
    const gen = ++this.syncGeneration;
    this.syncing = true; this.sourceValid = false;
    try {
      await this.session.sync(this.sourceXml());
      if (gen !== this.syncGeneration) return;
      this.sourceValid = true; this.message = "";
    } catch { this.message = t("choir.invalidSource"); }
    finally { if (gen === this.syncGeneration) { this.syncing = false; this.render(); } }
  }
  async open(): Promise<void> {
    this.close?.();
    await this.sync();
    this.body = element("div"); this.body.className = "choir-panel";
    const done = button(t("parts.done"), () => this.close?.());
    const modal = openModal({ title: t("choir.title"), boxClass: "choir-box", body: [this.body], footer: [done], onClose: () => {
      this.player.stop(); this.body = null; this.close = null;
    } });
    this.close = modal.close; this.render();
    if (!this.openedDraft) {
      this.openedDraft = true;
      try {
        const bytes = await loadChoirDraft();
        if (bytes && this.body) {
          const recover = button(t("choir.restoreDraft"), () => void this.run(() => this.restore(bytes)));
          recover.dataset.testid = "choir-restore-draft"; this.body.prepend(recover);
        }
      } catch { this.message = t("choir.draftUnavailable"); this.render(); }
    }
  }
  private edit(change: Parameters<ChoirSession["edit"]>[0]): void {
    if (this.syncing || !this.sourceValid) return;
    this.player.stop(); this.session.edit(change); this.render(); this.draft();
  }
  private snapshot(): ChoirProject {
    const p = this.session.project;
    if (!p || this.syncing || !this.sourceValid) throw new Error(t("choir.invalidSource"));
    p.editorSource = { format: this.app.docFormat, text: this.app.getText() };
    const omr = this.app.omr.snapshot();
    if (omr) p.originalOmr = packProject(omr, __APP_VERSION__);
    return p;
  }
  private draft(): void {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => void this.run(async () => {
      await saveChoirDraft(packChoirProject(this.snapshot()));
    }, t("choir.draftSaved"), false), 800);
  }
  private async run(action: () => Promise<void>, success = "", repaint = true): Promise<void> {
    try { await action(); this.message = success; }
    catch { this.message = t("choir.failed"); }
    if (repaint) this.render();
    else { const status = this.body?.querySelector("[role=status]"); if (status) status.textContent = this.message; }
  }
  private async restore(bytes: Uint8Array): Promise<void> {
    const p = await unpackChoirProject(bytes);
    if (!(await this.app.confirmReplace())) return;
    this.player.stop(); clearTimeout(this.timer); clearTimeout(this.draftTimer);
    this.restoring = true;
    try {
      if (p.originalOmr) {
        if (!(await this.app.openProject(p.originalOmr, "source.dolce", { draft: true }))) throw new Error("OMR restore failed");
      } else if (p.editorSource) {
        const format = formatOf(p.editorSource.format);
        const ext = p.editorSource.format === "fanqie" ? "txt" : p.editorSource.format === "jly" ? "jly" : p.editorSource.format;
        this.app.importBytes(format.encode(p.editorSource.text), `source.${ext}`);
      } else this.app.importBytes(new TextEncoder().encode(p.sourceXml), "source.musicxml");
      this.session.restore(p);
    } finally { this.restoring = false; }
    this.sourceValid = true; this.syncing = false; this.draft();
  }
  private async solo(role: ChoirRole): Promise<void> {
    const p = this.snapshot();
    // Audition is not confirmation, but all musical ambiguities must still be resolved.
    p.mapping.bindings.forEach(b => b.confirmed = true);
    const { projectChoir } = await import("./mapping");
    const result = projectChoir(loadScoreDoc(p.sourceXml), p.mapping, p.mapping.revision);
    if (!result.doc) { this.message = t("choir.resolveFirst"); this.render(); return; }
    const song = result.doc.songs[0];
    const src = playSourceOfDoc(song);
    const part = ROLES.indexOf(role);
    await this.player.play(src, { selectedParts: [part] });
  }
  private render(): void {
    const body = this.body; if (!body) return;
    body.replaceChildren();
    const project = this.session.project;
    const tools = element("div"); tools.className = "choir-actions";
    const undo = button(t("choir.undo"), () => { this.session.undo(); this.render(); this.draft(); }); undo.disabled = !this.session.canUndo || this.syncing || !this.sourceValid;
    const redo = button(t("choir.redo"), () => { this.session.redo(); this.render(); this.draft(); }); redo.disabled = !this.session.canRedo || this.syncing || !this.sourceValid;
    const open = element("input"); open.type = "file"; open.accept = ".dolcechoir"; open.hidden = true;
    open.addEventListener("change", () => { const f = open.files?.[0]; if (f) void this.run(async () => this.restore(new Uint8Array(await f.arrayBuffer()))); });
    const save = button(t("choir.save"), () => void this.run(async () => { const bytes = packChoirProject(this.snapshot()); await saveBytes(bytes, `${this.app.documentTitle() || "choir"}.dolcechoir`); }));
    save.disabled = !project || this.syncing || !this.sourceValid;
    tools.append(undo, redo, button(t("choir.open"), () => open.click()), open, save, button(t("choir.stop"), () => this.player.stop()));
    body.append(tools, element("p", t("choir.explain")));
    if (this.syncing) body.append(element("p", t("choir.syncing")));
    const msg = element("p", this.message); msg.setAttribute("role", "status"); body.append(msg);
    if (!project || !this.sourceValid) return;
    const doc = loadScoreDoc(project.sourceXml), lanes = enumerateLanes(doc);
    for (const binding of project.mapping.bindings) {
      const section = element("section"); section.className = "choir-role"; section.dataset.role = binding.role;
      section.append(element("h3", t(`choir.role.${binding.role}`)));
      const name = element("input"); name.value = binding.name; name.setAttribute("aria-label", t("choir.name")); name.maxLength = 200;
      name.addEventListener("change", () => this.edit(p => { p.mapping.bindings.find(b => b.role === binding.role)!.name = name.value; }));
      const lane = element("select"); lane.setAttribute("aria-label", t("choir.source"));
      lane.append(new Option(t("choir.choose"), ""));
      lanes.forEach((l, i) => lane.append(new Option(`${doc.songs[0].parts.find(p => p.id === l.partId)?.name ?? l.partId} · ${t("choir.lane", { staff: l.staff, voice: l.voice })}`, String(i))));
      lane.value = String(lanes.findIndex(l => l.partId === binding.partId && l.staff === binding.staff && l.voice === binding.voice));
      lane.addEventListener("change", () => { const l = lanes[Number(lane.value)]; if (l) this.edit(p => setLane(p.mapping.bindings.find(b => b.role === binding.role)!, l)); });
      const confirm = element("input"); confirm.type = "checkbox"; confirm.checked = binding.confirmed;
      confirm.addEventListener("change", () => this.edit(p => { p.mapping.bindings.find(b => b.role === binding.role)!.confirmed = confirm.checked; }));
      const confirmLabel = element("label", t("choir.confirm")); confirmLabel.prepend(confirm);
      const unison = element("input"); unison.type = "checkbox"; unison.checked = !!binding.allowUnison;
      unison.addEventListener("change", () => this.edit(p => { const b = p.mapping.bindings.find(b => b.role === binding.role)!; b.allowUnison = unison.checked; b.confirmed = false; }));
      const unisonLabel = element("label", t("choir.unison")); unisonLabel.prepend(unison);
      section.append(name, lane, button(t("choir.solo"), () => void this.run(() => this.solo(binding.role))), confirmLabel, unisonLabel);
      for (const choice of sourceNoteChoices(project.sourceXml, binding)) {
        const row = element("div"), pick = element("select");
        pick.setAttribute("aria-label", t("choir.noteChoice", { measure: choice.measure + 1, entry: choice.entry + 1 }));
        pick.append(new Option(t("choir.choose"), "")); choice.notes.forEach((n, i) => pick.append(new Option(n, String(i))));
        const selected = binding.notes?.find(n => n.measure === choice.measure && n.entry === choice.entry);
        pick.value = selected ? String(selected.noteIndex) : "";
        pick.addEventListener("change", () => this.edit(p => {
          const b = p.mapping.bindings.find(b => b.role === binding.role)!;
          b.notes = (b.notes ?? []).filter(n => n.measure !== choice.measure || n.entry !== choice.entry);
          if (pick.value !== "") b.notes.push({ measure: choice.measure, entry: choice.entry, signature: choice.signature, noteIndex: Number(pick.value) });
          b.confirmed = false;
        }));
        row.append(element("span", t("choir.noteChoice", { measure: choice.measure + 1, entry: choice.entry + 1 })), pick,
          button(t("choir.locate"), () => { this.close?.(); this.app.selectNote(choice.sourceId); })); section.append(row);
      }
      body.append(section);
    }
    const issues = this.session.projection?.issues ?? [];
    const list = element("ul"); list.dataset.testid = "choir-issues";
    for (const issue of issues) list.append(element("li", `${issue.role ?? ""} ${issue.measure !== undefined ? t("choir.measure", { n: issue.measure + 1 }) : ""} ${t(issueKeys[issue.code])}`));
    body.append(issues.length ? list : element("p", t("choir.ready")));
  }
}
