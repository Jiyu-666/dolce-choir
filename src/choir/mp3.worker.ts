import lamejs from "./vendor/lame.all.js";

const encoder = new lamejs.Mp3Encoder(1, 44100, 128);
const chunks: Uint8Array[] = [];
self.onmessage = (event: MessageEvent<{ id: number; pcm?: Float32Array; gain?: number; finish?: boolean }>) => {
  const { id, pcm, gain = 1, finish } = event.data;
  try {
    if (pcm) {
      const block = new Int16Array(1152);
      for (let offset = 0; offset < pcm.length; offset += block.length) {
        const length = Math.min(block.length, pcm.length - offset);
        for (let i = 0; i < length; i++) {
          const x = Math.max(-1, Math.min(1, pcm[offset + i] * gain));
          block[i] = Math.round(x * (x < 0 ? 32768 : 32767));
        }
        const out = encoder.encodeBuffer(block.subarray(0, length));
        if (out.length) chunks.push(new Uint8Array(out));
      }
    }
    if (finish) {
      const tail = encoder.flush(); if (tail.length) chunks.push(new Uint8Array(tail));
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      chunks.length = 0;
      self.postMessage({ id, bytes }, { transfer: [bytes.buffer] });
    } else self.postMessage({ id });
  } catch (error) { self.postMessage({ id, error: String(error) }); }
};
