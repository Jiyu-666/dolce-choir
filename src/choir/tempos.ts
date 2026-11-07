import type {Song} from "../model/doc";
import {tempoConflictsOfDoc} from "../model/playdoc";

/** Called only through the editor's fresh-model/undo path after an explicit choice. */
export function chooseSourceTempo(song:Song,measure:number,beat:number,bpm:number):void{
  const group=tempoConflictsOfDoc(song).find(g=>g[0].measure===measure&&g[0].beat===beat);
  if(!group?.some(c=>Math.abs(c.bpm-bpm)<1e-6))throw new Error("Stale or invalid tempo choice");
  for(const c of group){
    if(c.direction){
      if(c.direction.sound?.tempo!==undefined)c.direction.sound.tempo=bpm;
      if(c.direction.tempo?.perMinute!==undefined){c.direction.tempo.perMinute=bpm/c.beatFactor;delete c.direction.tempo.perMinuteText;}
    }else{
      const index=song.tempos!.findIndex(v=>typeof v==="number");song.tempos![index]=bpm/c.beatFactor;
    }
  }
}
