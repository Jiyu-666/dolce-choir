/** Numeric tempo map shared by preview, MIDI, offline audio and practice. Beats are quarter notes. */
export interface TempoPoint { t: number; bpm: number }
export class TempoClock {
  private points: { beat: number; seconds: number; spq: number }[] = [];
  constructor(tempos: readonly TempoPoint[], speed = 1) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error("Invalid tempo multiplier");
    const sorted = [...tempos].sort((a,b) => a.t-b.t);
    if (!sorted.length || sorted[0].t !== 0) sorted.unshift({t:0,bpm:90});
    for (const p of sorted) {
      if (!Number.isFinite(p.t) || p.t < 0 || !Number.isFinite(p.bpm) || p.bpm <= 0) throw new Error("Invalid numeric tempo");
      const last = this.points[this.points.length-1];
      const seconds = last ? last.seconds + (p.t-last.beat)*last.spq : 0;
      const point = { beat:p.t, seconds, spq:60/(p.bpm*speed) };
      if (last?.beat === p.t) this.points[this.points.length-1] = point;
      else this.points.push(point);
    }
  }
  secondsAt(beat: number): number {
    const p = this.points.reduce((prev, cur) => cur.beat <= beat ? cur : prev, this.points[0]);
    return p.seconds + (beat-p.beat)*p.spq;
  }
  beatAt(seconds: number): number {
    const p = this.points.reduce((prev, cur) => cur.seconds <= seconds ? cur : prev, this.points[0]);
    return p.beat + (seconds-p.seconds)/p.spq;
  }
}
