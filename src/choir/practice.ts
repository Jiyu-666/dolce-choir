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
import { PracticeComparison, liveComparison, type PracticeResult } from "./comparison";
import { calibrateLatency } from "./latency";
import { sourceRevision } from "./project";
import { scoreDocToMusicXml } from "../model/toxml";
import "./practice.css";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.textContent = text; return node; }
export function showPractice(doc: ScoreDoc, revision: string, layout: ChoirLayout, resources: PaintResources): () => void {
  const all = compilePerformance(doc, revision, { role: "S" });
  const body = el("div"); body.className = "practice-view";
  const controls = el("div"); controls.className = "practice-controls";
  const status = el("p"); status.setAttribute("role", "status"); status.dataset.testid = "practice-state";
  const clock = el("output"), score = el("div"); score.className = "practice-score";
  const warning = el("p", t("practice.transportOnly"));
  const tempoText=el("p");
  const feedback = el("p"), summary = el("section"); feedback.className = "practice-feedback";
  feedback.dataset.testid = "practice-feedback"; feedback.setAttribute("role","status"); summary.dataset.testid = "practice-summary";
  const fingerprint = sourceRevision(scoreDocToMusicXml(doc));
  let comparison: PracticeComparison | null = null, attempt = 0, calibrationKey: string | null = null;
  let calibrationController: AbortController | null = null;
  const delay = el("input"); delay.type="number"; delay.min="-500"; delay.max="500"; delay.value="0"; delay.step="5";
  delay.dataset.testid="practice-latency";
  const calibrate = el("button",t("practice.calibrate")), delayStatus=el("p",t("practice.rhythmEstimated"));
  calibrate.disabled=!MicrophoneInput.supported();
  let role: ChoirRole = "S", plan: PerformancePlan, painter = new ScorePainter(resources), paintGeneration = 0;
  let activeId: number | undefined, activeSystem: Element | null = null;
  const start = el("button", t("practice.start")), pause = el("button", t("practice.pause")), stop = el("button", t("practice.stop"));
  start.dataset.testid = "practice-start"; pause.dataset.testid = "practice-pause"; stop.dataset.testid = "practice-stop";
  const micText = el("p"), mic = el("input"); mic.type = "checkbox"; mic.checked = MicrophoneInput.supported(); mic.disabled = !mic.checked; mic.dataset.testid = "practice-microphone";
  const input = new MicrophoneInput({
    frame: frame => {
      if(!comparison||!["count-in","practicing"].includes(transport.state))return;
      const seconds=transport.planSecondsAtAudioTime(frame.audioTime),active=transport.isPerformanceAudioTime(frame.audioTime);
      comparison.add(frame,seconds,active,transport.activeFrom);
      if(!active||seconds-delay.valueAsNumber/1000<transport.activeFrom||seconds-delay.valueAsNumber/1000>=plan.durationSeconds)return;
      const result=liveComparison(plan,frame,seconds-delay.valueAsNumber/1000,transport.audioContext!.sampleRate);
      feedback.dataset.state=result.state;
      feedback.textContent=t(`practice.feedback.${result.state}`)+(result.cents===undefined?"":` (${result.cents>0?"+":""}${Math.round(result.cents)} ${t("practice.cents")})`);
    },
    gap: gap => {
      if(comparison&&["count-in","practicing"].includes(transport.state))comparison.gap({from:transport.planSecondsAtAudioTime(gap.from),to:transport.planSecondsAtAudioTime(gap.to)});
      feedback.dataset.state="uncertain"; feedback.textContent = t("practice.analysisGap");
    },
    error: () => { transport.pause(); micText.textContent = t("practice.micError"); },
  });
  const transport = new PracticeTransport({
    prepare: async (ctx, signal) => {
      if (!mic.checked) return;
      micText.textContent = t("practice.quietCalibrating");
      await input.start(ctx, signal);
      if(!comparison)comparison=new PracticeComparison(plan,await fingerprint,attempt,ctx.sampleRate,{seconds:delay.valueAsNumber/1000,calibrated:calibrationKey!==null&&calibrationKey===input.deviceKey});
      delayStatus.textContent=t(comparison.latency.calibrated?"practice.rhythmCalibrated":"practice.rhythmEstimated");
      const settings = input.settings!;
      micText.textContent = t("practice.micSettings", { rate: settings.sampleRate, echo: String(settings.echoCancellation ?? "?"), gain: String(settings.autoGainControl ?? "?"), noise: String(settings.noiseSuppression ?? "?") });
    },
    state: (state: PracticeState, error?: unknown) => {
      if (state === "ready" && plan) { painter.highlight(null); clock.textContent = `0 / ${plan.durationSeconds.toFixed(1)} s`; }
      status.dataset.state = state; status.textContent = t(`practice.state.${state}`);
      if(["ready","paused","count-in","loading","error"].includes(state)){feedback.dataset.state="uncertain";feedback.textContent=state==="count-in"?t("practice.noCountInScore"):"";}
      if(state==="practicing")comparison?.resume(transport.audioContext!.currentTime);
      if(state==="completed"&&comparison)showResult(comparison.result());
      if (state === "error" && error instanceof Error) micText.textContent = error.message === "Quiet environment needed" ? t("practice.quietRetry") : t("practice.micError");
      start.disabled = !!calibrationController || ["loading", "count-in", "practicing"].includes(state);
      pause.disabled = !["loading", "count-in", "practicing"].includes(state);
    },
    attempt: number => { attempt=number;comparison=null;summary.replaceChildren();status.dataset.attempt = String(number); },
    rewind: (to,at,audioTime) => { comparison?.rewind(to,at,audioTime);activeId = undefined; painter.highlight(null); },
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
  setting(t("practice.delayMs"),delay);controls.append(calibrate);
  calibrate.addEventListener("click",()=>void(async()=>{
    if(calibrationController)return;
    configure();const controller=new AbortController();calibrationController=controller;start.disabled=true;calibrate.disabled=true;
    controls.inert=true;roles.inert=true;
    delayStatus.textContent=t("practice.calibrationInstructions");
    try{
      const result=await calibrateLatency(controller.signal);delay.value=String(Math.round(result.seconds*1000));calibrationKey=result.deviceKey;
      delayStatus.textContent=t("practice.calibrationDone",{ms:Math.round(result.seconds*1000),spread:Math.round(result.spread*1000)});configure();
    }catch{calibrationKey=null;delayStatus.textContent=t("practice.calibrationFailed");}
    finally{calibrationController=null;controls.inert=false;roles.inert=false;calibrate.disabled=!MicrophoneInput.supported();configure();}
  })());
  delay.addEventListener("change",()=>{calibrationKey=null;delayStatus.textContent=t("practice.rhythmEstimated");configure();});
  const deviceChanged=()=>{calibrationKey=null;calibrationController?.abort();configure();delayStatus.textContent=t("practice.deviceChanged");};
  navigator.mediaDevices?.addEventListener("devicechange",deviceChanged);
  function configure(): void {
    comparison=null;summary.replaceChildren();
    if (!speed.checkValidity() || !delay.checkValidity() || Number(to.value) < Number(from.value)) { transport.stop(); status.textContent = t("practice.invalidRange"); start.disabled = true; return; }
    plan = compilePerformance(doc, revision, { role, speed: speed.valueAsNumber, octave: Number(octave.value) as -1|0|1, fromOccurrence: Number(from.value), toOccurrence: Number(to.value) });
    warning.textContent = mic.checked ? t("practice.micTrial") : t("practice.transportOnly");
    tempoText.textContent=t(plan.assumedInitialTempo?"practice.defaultTempo":"practice.initialTempo",{bpm:plan.tempos[0].bpm,speed:plan.speed});
    if (!MicrophoneInput.supported()) micText.textContent = t("practice.micUnsupported");
    transport.configure(plan, { piano: piano.checked, metronome: metronome.checked, loop: loop.checked,captureTail:mic.checked?Math.max(0,delay.valueAsNumber/1000)+.12:0 });
    for (const button of roles.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.role === role));
    activeId = undefined; painter.highlight(null); clock.textContent = `0 / ${plan.durationSeconds.toFixed(1)} s`;
  }
  function showResult(result:PracticeResult):void{
    const percent=(n:number)=>`${Math.round(n*100)}%`;
    summary.replaceChildren(el("h3",t("practice.result")),el("p",t("practice.coverage",{percent:percent(result.coverage)})),
      el("p",result.pitchConclusion===null?t("practice.insufficientCoverage"):t("practice.accuracy",{percent:percent(result.pitchConclusion)})),
      el("p",t("practice.rhythmSummary",{judged:result.rhythm.judged,within:result.rhythm.withinTolerance,ms:result.rhythm.meanAbsoluteOffsetSeconds===null?"—":Math.round(result.rhythm.meanAbsoluteOffsetSeconds*1000)})),
      el("p",t(result.rhythm.estimated?"practice.rhythmEstimated":"practice.rhythmCalibrated")),
      el("p",t("practice.restVoicing",{seconds:result.restVoicingSeconds.toFixed(1)})));
    for(const i of result.problemMeasures){
      const m=plan.measures[i],retry=el("button",t("practice.retryMeasure",{measure:m.measure+1,occurrence:m.occurrence}));
      const index=Number(from.value)+i;
      retry.addEventListener("click",()=>{from.value=to.value=String(index);configure();void transport.start();});summary.append(retry);
    }
    const details=el("details"),heading=el("summary",t("practice.noteResults"));details.append(heading);
    details.addEventListener("toggle",()=>{
      if(!details.open||details.children.length>1)return;
      const table=el("table"),head=el("tr");for(const label of ["note","state","coverageLabel","accuracyLabel","onsetLabel"] as const)head.append(el("th",t(`practice.column.${label}`)));table.append(head);
      result.notes.forEach((n,i)=>{
        const row=el("tr");for(const text of [String(i+1),t(`practice.feedback.${n.status}`),n.eligibleSeconds?percent(n.judgedSeconds/n.eligibleSeconds):"—",n.judgedSeconds?percent(n.correctSeconds/n.judgedSeconds):"—",n.onsetOffsetSeconds===null?t("practice.onsetUnknown"):`${Math.round(n.onsetOffsetSeconds*1000)} ms`])row.append(el("td",text));table.append(row);
      });details.append(table);
    });summary.append(details);
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
  start.addEventListener("click", () => { if(!calibrationController)void transport.start(); }); pause.addEventListener("click", () => transport.pause()); stop.addEventListener("click", () => {calibrationController?.abort();transport.stop();});
  const actions = el("div"); actions.className = "practice-actions"; actions.append(start,pause,stop,clock);
  body.append(roles,controls,warning,tempoText,status,micText,delayStatus,actions,feedback,summary,score);
  const close = el("button", t("parts.done"));
  const modal = openModal({ title: doc.songs[0].work.title || t("practice.title"), boxClass: "practice-box", body: [body], footer: [close], onClose: () => { paintGeneration++; calibrationController?.abort();transport.dispose(); input.stop();navigator.mediaDevices?.removeEventListener("devicechange",deviceChanged); } });
  close.addEventListener("click", modal.close);
  function requestPaint(): void { void paint().catch(error => { console.error(error); status.textContent = t("choir.failed"); }); }
  configure(); requestPaint();
  return modal.close;
}
