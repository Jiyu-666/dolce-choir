import "../styles.css";
import "./standalone.css";
import { initLang,t } from "../i18n";
import { asset } from "../common/asset";
import { registerBravura } from "../common/musicfonts";
import { setMeasureBackend } from "../common/measure";
import { browserMeasure,ensureFontsReady } from "../common/measure.browser";
import { PaintResources } from "../layout/painter";
import { readPracticePackage } from "./package";
import { showPractice } from "./practice";

function el<K extends keyof HTMLElementTagNameMap>(tag:K,text=""):HTMLElementTagNameMap[K]{const node=document.createElement(tag);node.textContent=text;return node;}
export async function bootPractice():Promise<void>{
  initLang();setMeasureBackend(browserMeasure);
  const root=el("main");root.className="practice-landing";
  const title=el("h1",t("practice.title")),status=el("p",t("practice.loadingPackage"));status.setAttribute("role","status");
  const file=el("input");file.type="file";file.accept=".dolcepractice";file.hidden=true;file.dataset.testid="practice-package-file";
  const open=el("button",t("practice.openPackage")),demo=el("button",t("practice.demo")),editor=el("a",t("practice.editor"));
  editor.href=asset("");open.addEventListener("click",()=>file.click());demo.addEventListener("click",()=>{if(location.hash==="#/practice/demo")void route();else location.hash="/practice/demo";});
  root.append(title,status,open,demo,editor,file);document.body.append(root);
  if(/MicroMessenger/i.test(navigator.userAgent))root.append(el("p",t("practice.systemBrowser")));
  const resources=PaintResources.shared();let close:(()=>void)|null=null,generation=0;
  const ready=(async()=>{await registerBravura();await ensureFontsReady([{family:"Bravura",size:40},{family:"Bravura Text",size:20},{family:"PingFang SC",size:28}]);await resources.prepare();})();
  async function load(bytes:Uint8Array,gen:number):Promise<void>{
    const result=await readPracticePackage(bytes);await ready;if(gen!==generation)return;
    title.textContent=result.package.title;status.textContent=t("practice.localTrial");
    close=showPractice(result.doc,result.package.fingerprint,result.package.layout,resources,{plans:result.plans,defaults:result.package.defaults});
  }
  file.addEventListener("change",()=>void(async()=>{
    const selected=file.files?.[0];if(!selected)return;const gen=++generation;close?.();close=null;
    try{if(selected.size>10*1024*1024)throw new Error("Package exceeds10MiB");await load(new Uint8Array(await selected.arrayBuffer()),gen);}
    catch{status.textContent=t("practice.invalidPackage");}finally{file.value="";}
  })());
  async function route():Promise<void>{
    const gen=++generation;close?.();close=null;status.textContent=t("practice.loadingPackage");
    const path=location.hash.slice("#/practice".length).replace(/^\//,"");
    try{
      if(path==="demo"){
        const response=await fetch(asset("choir/demo.dolcepractice"));if(!response.ok)throw new Error("Demo unavailable");await load(new Uint8Array(await response.arrayBuffer()),gen);
      }else if(!path||path==="local")status.textContent=t("practice.choosePackage");
      else status.textContent=t("practice.shareUnconfigured");
    }catch{if(gen===generation)status.textContent=t("practice.invalidPackage");}
  }
  window.addEventListener("hashchange",()=>{if(location.hash.startsWith("#/practice"))void route();});
  await ready;await route();
}
