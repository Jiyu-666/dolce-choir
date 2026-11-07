declare const lamejs: {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer(samples: Int16Array): Int8Array;
    flush(): Int8Array;
  };
};
export default lamejs;
