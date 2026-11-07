import {test,expect} from "vitest";
import {estimateLatency} from "../../src/choir/latency";

test("known emitted clicks establish a path delay without access to score or singing results",()=>{
  const schedule=[1,1.7,2.4,3.1],delays=[.1,.105,.098,.101];
  const peaks=schedule.map((time,i)=>({audioTime:time+delays[i],amplitude:.2}));
  peaks.push({audioTime:1.25,amplitude:.001});
  const result=estimateLatency(peaks,schedule,.001);expect(result.seconds).toBeCloseTo(.101);expect(result.matched).toBe(4);expect(result.spread).toBeLessThan(.006);
});
test("missing clicks and inconsistent/noisy returns cannot claim calibrated timing",()=>{
  const schedule=[1,1.7,2.4,3.1];
  expect(()=>estimateLatency([],schedule,.001)).toThrow();
  expect(()=>estimateLatency(schedule.map((t,i)=>({audioTime:t+[.03,.1,.23,.4][i],amplitude:.2})),schedule,.001)).toThrow();
  expect(()=>estimateLatency(schedule.map(t=>({audioTime:t+.1,amplitude:.01})),schedule,.01)).toThrow();
});
