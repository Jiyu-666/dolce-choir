declare abstract class AudioWorkletProcessor { readonly port: MessagePort; abstract process(inputs: Float32Array[][]): boolean }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
declare const currentFrame: number;

/** Copy only: pitch estimation and window assembly run in the analysis Worker. No output/monitoring. */
class ChoirCapture extends AudioWorkletProcessor {
  private block = new Float32Array(1024);
  private used = 0;
  private first = 0;
  private running = true;
  constructor() { super(); this.port.onmessage = () => { this.running = false; }; }
  process(inputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const mono = inputs[0]?.[0]; if (!mono) return true;
    for (let i = 0; i < mono.length; i++) {
      if (!this.used) this.first = currentFrame+i;
      this.block[this.used++] = mono[i];
      if (this.used === this.block.length) {
        this.port.postMessage({samples:this.block,firstFrame:this.first},[this.block.buffer]);
        this.block = new Float32Array(1024); this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor("choir-capture",ChoirCapture);
export {};
