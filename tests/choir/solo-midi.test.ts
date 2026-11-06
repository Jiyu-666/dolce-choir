import { test, expect } from "vitest";
import { soloPianoMidi } from "../../src/score/midi";

function tracks(bytes: Uint8Array) {
  const result: number[][] = [];
  let offset = 14;
  while (offset < bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0);
    result.push([...bytes.slice(offset + 8, offset + 8 + length)]); offset += 8 + length;
  }
  return result;
}
const plan = {durationBeats:8,speed:.5,tempos:[{t:0,bpm:60},{t:4,bpm:120}],notes:[{startBeat:2,endBeat:3,pitch:48,velocity:90},{startBeat:5,endBeat:7,pitch:50,velocity:100}]};
test("solo MIDI contains one piano channel and the compiled notes/tempo segments only", () => {
  const b = soloPianoMidi(plan, "B"), t = tracks(b);
  expect((b[10]<<8)|b[11]).toBe(2); expect(t).toHaveLength(2);
  expect(Buffer.from(t[0]).toString("hex")).toContain("ff51031e8480"); // 30BPM at half speed
  expect(Buffer.from(t[0]).toString("hex")).toContain("ff51030f4240"); // 60BPM later
  expect(Buffer.from(t[1]).toString("hex")).toContain("00c000");
  const on = t[1].flatMap((x,i) => x===0x90 ? [[t[1][i+1],t[1][i+2]]] : []);
  expect(on).toEqual([[48,90],[50,100]]);
  expect(t[1].some(x=>x>=0x91&&x<=0x9f)).toBe(false);
});
test("silent solo keeps duration and never manufactures a note", () => {
  const t = tracks(soloPianoMidi({...plan,notes:[]}, "S"));
  expect(t[1]).not.toContain(0x90);
  expect(Buffer.from(t[1]).toString("hex")).toContain("bc00ff2f00"); // EOT at 8*960 ticks
});
