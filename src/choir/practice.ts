import type { ScoreDoc } from "../model/doc";
import { ScorePainter, type PaintResources } from "../layout/painter";
import { openModal } from "../editor/dialogs";
import { t } from "../i18n";
import { ROLES, type ChoirRole } from "./mapping";
import { choirPaintRequest } from "./layout";
import type { ChoirLayout } from "./project";
import { compilePerformance, type PerformancePlan } from "./performance";
import { MicrophoneInput } from "./microphone";
import { PracticeTransport, type PracticeState } from "./transport";
import "./practice.css";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.textContent = text; return node; }
export function showPractice(doc: ScoreDoc, revision: string, layout: ChoirLayout, resources: PaintResources): void {
  const body = el("div"); body.className = "practice-view";
  const controls = el("div"); controls.className = "practice-controls";
  const status = el("p"); status.setAttribute("role", "status"); status.dataset.testid = "practice-state";
  const clock = el("output"), score = el("div"); score.className = "practice-score";
  const warning = el("p", t("practice.transportOnly"));
  let role: ChoirRole = "S", plan: PerformancePlan, painter = new ScorePainter(resources), paintGeneration = 0;
  let activeId: number | undefined, activeSystem: Element | null = null;
  const start = el("button", t("practice.start")), pause = el("button", t("practice.pause")), stop = el("button", t("practice.stop"));
  start.dataset.testid = "practice-start"; pause.dataset.testid = "practice-pause"; stop.dataset.testid = "practice-stop";
  const micText = el("p"), mic = el("input"); mic.type = "checkbox"; mic.checked = MicrophoneInput.supported(); mic.disabled = !mic.checked; mic.dataset.testid = "practice-microphone";
  const input = new MicrophoneInput({
    frame: frame => {
      if (transport.state !== "practicing") return;
      micText.textContent = frame.state === "pitched" ? t("practice.pitch", { hz: frame.frequency!.toFixed(1), clarity: frame.clarity.toFixed(2) }) : t(`practice.input.${frame.state}`);
    },
    gap: () => { micText.textContent = t("practice.analysisGap"); },
    error: () => { transport.pause(); micText.textContent = t("practice.micError"); },
  });
  const transport = new PracticeTransport({
    prepare: async (ctx, signal) => {
      if (!mic.checked) return;
      micText.textContent = t("practice.quietCalibrating");
      await input.start(ctx, signal);
      const settings = input.settings!;
      micText.textContent = t("practice.micSettings", { rate: settings.sampleRate, echo: String(settings.echoCancellation ?? "?"), gain: String(settings.autoGainControl ?? "?"), noise: String(settings.noiseSuppression ?? "?") });
    },
    state: (state: PracticeState, error?: unknown) => {
      if (state === "ready" && plan) { painter.highlight(null); clock.textContent = `0 / ${plan.durationSeconds.toFixed(1)} s`; }
      status.dataset.state = state; status.textContent = t(`practice.state.${state}`);
      if (state === "error" && error instanceof Error) micText.textContent = error.message === "Quiet environment needed" ? t("practice.quietRetry") : t("practice.micError");
      start.disabled = ["loading", "count-in", "practicing"].includes(state);
      pause.disabled = !["loading", "count-in", "practicing"].includes(state);
    },
    attempt: number => { status.dataset.attempt = String(number); },
    rewind: () => { activeId = undefined; painter.highlight(null); },
    tick: (seconds, count) => {
      clock.textContent = count ? t("practice.count", { n: count }) : `${seconds.toFixed(1)} / ${plan.durationSeconds.toFixed(1)} s`;
      const anchor = [...plan.anchors].reverse().find(a => a.seconds <= seconds + .01);
      if (anchor?.elementId !== undefined && anchor.elementId !== activeId) {
        activeId = anchor.elementId; painter.highlight(activeId, anchor.pass, anchor.occurrence);
        const head = score.querySelector("rect.playhead"), system = head?.parentElement;
        if (system && system !== activeSystem) { activeSystem = system; head?.scrollIntoView({ block: "center", behavior: "smooth" }); }
      }
    },
  });
  const all = compilePerformance(doc, revision, { role });
  const from = el("select"), to = el("select"); from.dataset.testid = "practice-from"; to.dataset.testid = "practice-to";
  for (const [i, m] of all.measures.entries()) {
    const text = t("practice.measure", { measure: m.measure + 1, occurrence: m.occurrence });
    from.append(new Option(text, String(i))); to.append(new Option(text, String(i)));
  }
  to.value = String(all.measures.length - 1);
  const speed = el("input"); speed.type = "number"; speed.min = ".25"; speed.max = "3"; speed.step = ".05"; speed.value = "1"; speed.dataset.testid = "practice-speed";
  const octave = el("select"); for (const n of [-1,0,1]) octave.append(new Option(t("practice.octave", { n }), String(n))); octave.value = "0";
  const piano = el("input"), metronome = el("input"), loop = el("input");
  for (const input of [piano,metronome,loop]) input.type = "checkbox";
  loop.dataset.testid = "practice-loop";
  piano.dataset.testid = "practice-piano"; metronome.dataset.testid = "practice-metronome";
  function setting(label: string, input: HTMLElement): void { const l = el("label", label); l.append(input); controls.append(l); }
  const roles = el("div"); roles.className = "practice-roles";
  for (const [i, r] of ROLES.entries()) {
    const button = el("button", `${r} · ${doc.songs[0].parts[i].name}`); button.dataset.role = r;
    button.addEventListener("click", () => { role = r; configure(); requestPaint(); }); roles.append(button);
  }
  setting(t("practice.from"), from); setting(t("practice.to"), to); setting(t("practice.speed"), speed); setting(t("practice.octaveLabel"), octave);
  setting(t("practice.microphone"), mic); setting(t("practice.piano"), piano); setting(t("practice.metronome"), metronome); setting(t("practice.loop"), loop);
  function configure(): void {
    if (!speed.checkValidity() || Number(to.value) < Number(from.value)) { transport.stop(); status.textContent = t("practice.invalidRange"); start.disabled = true; return; }
    plan = compilePerformance(doc, revision, { role, speed: speed.valueAsNumber, octave: Number(octave.value) as -1|0|1, fromOccurrence: Number(from.value), toOccurrence: Number(to.value) });
    warning.textContent = mic.checked ? t("practice.micTrial") : t("practice.transportOnly");
    if (!MicrophoneInput.supported()) micText.textContent = t("practice.micUnsupported");
    transport.configure(plan, { piano: piano.checked, metronome: metronome.checked, loop: loop.checked });
    for (const button of roles.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.role === role));
    activeId = undefined; painter.highlight(null); clock.textContent = `0 / ${plan.durationSeconds.toFixed(1)} s`;
  }
  async function paint(): Promise<void> {
    const gen = ++paintGeneration, selected = ROLES.indexOf(role), next = new ScorePainter(resources);
    const request = choirPaintRequest(doc, layout, new Set(ROLES.flatMap((_, i) => i === selected ? [] : [i])));
    await next.load({ ...request, page: { widthPt: Math.min(600,Math.max(280,score.clientWidth)) * .75, heightPt: null, override: true, marginsPt: [12,12,12,12] } });
    if (gen !== paintGeneration) return;
    painter = next; activeId = undefined; activeSystem = null; score.replaceChildren();
    for (let i = 0; i < painter.pageCount; i++) score.append(painter.renderPage(i));
  }
  for (const input of [from,to,speed,octave,piano,metronome,loop,mic]) input.addEventListener("change", configure);
  start.addEventListener("click", () => void transport.start()); pause.addEventListener("click", () => transport.pause()); stop.addEventListener("click", () => transport.stop());
  const actions = el("div"); actions.className = "practice-actions"; actions.append(start,pause,stop,clock);
  body.append(roles,controls,warning,status,micText,actions,score);
  const close = el("button", t("parts.done"));
  const modal = openModal({ title: doc.songs[0].work.title || t("practice.title"), boxClass: "practice-box", body: [body], footer: [close], onClose: () => { paintGeneration++; transport.dispose(); input.stop(); } });
  close.addEventListener("click", modal.close);
  function requestPaint(): void { void paint().catch(error => { console.error(error); status.textContent = t("choir.failed"); }); }
  configure(); requestPaint();
}
