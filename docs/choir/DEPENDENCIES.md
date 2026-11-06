# Choir dependencies and local assets

- Existing FluidR3 GM grand piano MP3 samples: public/redist/soundfont, Frank Wen / MIDI.js rendering Benjamin Gleitzman, CC BY3.0; attribution accompanies every audio ZIP. No remote instruments loaded.
- lamejs exactly1.2.1, npm lockfile integrity recorded, LGPL-3.0 as declared by the package. Used only in the MP3 Worker. CommonJS entry constructor fails with `MPEGMode is not defined`; reproduced locally. Official npm `lame.all.js` is preserved in src/choir/vendor with only an appended ES export; original SHA256/provenance in its README. Upstream package LICENSE and historical Java COPYING retained; LGPL3 full text additionally included. Source/relinkable worker module remains publicly available. https://github.com/zhuker/lamejs and https://lame.sourceforge.io/.
- use-strict1.0.1 is the locked lamejs transitive dependency (ISC), not runtime CDN code.
- npm install aligned lockfile root version0.8.3 with the already-existing package.json0.8.6; no existing dependency versions were upgraded. npm reported four existing/transitive audit advisories; no unrequested broad audit-fix changes were applied.

- Pitchy exactly4.1.0 (0BSD), local Worker fundamental-frequency detection; https://github.com/ianprime0509/pitchy. Locked fft.js4.0.4(MIT) transitive dependency. Library clarity is a periodicity measure, not a correctness probability. Defaults retain Pitchy's internal0.9 peak selection and separate output clarity gate0.85. Strong second harmonic can yield an octave error and remains explicitly unverified for general singing.
