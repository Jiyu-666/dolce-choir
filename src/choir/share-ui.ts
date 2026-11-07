import QRCode from "qrcode";
import {openModal} from "../common/modal";
import {asset} from "../common/asset";
import {t} from "../i18n";
import {buildPracticePackage,readPracticePackage} from "./package";
import {packChoirProject,type ChoirProject} from "./project";
import {saveChoirDraft} from "./draft";
import {shareConfig,ShareError} from "./share-config";
import {sharingAuth,publishPractice,listShares,revokeShare,storedShareLink} from "./share-client";

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text=""):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);e.textContent=text;return e;};
export async function showSharePanel(project:ChoirProject):Promise<void>{
  const bytes=await buildPracticePackage(project,__APP_VERSION__),loaded=await readPracticePackage(bytes),body=el("div");body.className="choir-panel";
  body.dataset.testid="share-publisher";
  const status=el("p"),result=el("div"),list=el("div"),actions=el("div");status.setAttribute("role","status");
  let configured=false;try{configured=!!shareConfig();}catch{status.textContent=t("share.invalidConfig");}
  const run=async(action:()=>Promise<void>)=>{try{status.textContent="";await action();}catch(error){status.textContent=t(error instanceof ShareError&&error.status===403?"share.notMaintainer":error instanceof ShareError&&error.status===401?"share.loginRequired":"share.failed");}};
  const button=(text:string,action:()=>Promise<void>)=>{const b=el("button",text);b.type="button";b.addEventListener("click",()=>{b.disabled=true;void run(action).finally(()=>{b.disabled=false;});});return b;};
  async function showLink(link:string):Promise<void>{
    const input=el("input");input.readOnly=true;input.value=link;input.setAttribute("aria-label",t("share.link"));input.style.width="100%";
    const copy=button(t("share.copy"),async()=>{await navigator.clipboard.writeText(link);status.textContent=t("share.copied");});
    const canvas=el("canvas");await QRCode.toCanvas(canvas,link,{width:200,margin:2});result.replaceChildren(input,copy,canvas);
  }
  async function refresh(offset=0):Promise<void>{
    const data=await listShares(offset);if(!offset)list.replaceChildren();
    for(const row of data.items){
      const item=el("section");item.dataset.shareId=row.id;item.append(el("p",`${row.title} · ${new Date(row.created_at).toLocaleString()} · ${t(row.revoked_at?"share.revoked":row.state==="ready"?"share.published":"share.pending")}`));
      if(!row.revoked_at){
        const link=storedShareLink(row.id);if(link)item.append(button(t("share.showLink"),()=>showLink(link)));else item.append(el("p",t("share.noLocalLink")));
        item.append(button(t("share.revoke"),async()=>{await revokeShare(row.id);result.replaceChildren();await refresh();}));
      }list.append(item);
    }
    if(data.nextOffset!==null)list.append(button(t("share.more"),()=>refresh(data.nextOffset!)));
  }
  const login=button(t("share.login"),async()=>{
    await saveChoirDraft(packChoirProject(project));
    const {error}=await sharingAuth().auth.signInWithOAuth({provider:"github",options:{redirectTo:`${location.origin}${asset("")}?choirAuth=1`}});if(error)throw error;
  });
  const publish=button(t("share.publish"),async()=>{const published=await publishPractice(bytes,loaded.package.fingerprint);await showLink(published.link);status.textContent=t("share.published");await refresh();});
  publish.dataset.testid="share-publish";
  actions.append(login,publish,button(t("share.refresh"),()=>refresh()));
  body.append(el("p",t("share.snapshot",{title:loaded.package.title,kib:Math.ceil(bytes.length/1024)})),el("p",loaded.package.voices.map(v=>`${v.role} ${v.name}`).join(" · ")),el("p",t("share.revocationLimit")),actions,status,result,list);
  if(!configured){status.textContent=t("practice.shareUnconfigured");for(const b of actions.querySelectorAll("button"))b.disabled=true;}
  const done=el("button",t("parts.done")),modal=openModal({title:t("share.title"),boxClass:"choir-box",body:[body],footer:[done]});done.addEventListener("click",modal.close);
  if(configured){const {data}=await sharingAuth().auth.getSession();if(data.session)void run(()=>refresh());}
}
