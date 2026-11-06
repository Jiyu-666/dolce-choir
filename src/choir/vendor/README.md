# lamejs1.2.1 official distribution

Source: npm lamejs@1.2.1/lame.all.js, https://github.com/zhuker/lamejs.
Original SHA256: 026bd88846040f357a937cd85821a48492a362eff0812cda734f23fca55fea3b.
Only change: appended `export default lamejs;` for ES module bundling. All encoder source retained, LGPL-3.0; see LICENSE.lamejs.txt and upstream source. The npm1.2.1 CommonJS entry throws `MPEGMode is not defined` when constructing Mp3Encoder; the official self-contained build passes. No runtime CDN or eval.

The distributable encoder is imported only by the MP3 Worker, independent from application code. LAME: https://lame.sourceforge.io/.
