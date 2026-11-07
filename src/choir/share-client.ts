import {createClient} from "@supabase/supabase-js";
import {asset} from "../common/asset";
import {newShareToken} from "./share-contract";
import {shareConfig,shareRequest,ShareError} from "./share-config";

let client:ReturnType<typeof createClient>|null=null;
export function sharingAuth(){
  const config=shareConfig();if(!config)throw new ShareError(503,"not_configured");
  return client??=createClient(config.url,config.key,{auth:{flowType:"pkce"}});
}
export function shareLink(token:string):string{return `${location.origin}${asset("")}#/practice/${token}`;}
async function access():Promise<string>{const {data}=await sharingAuth().auth.getSession();if(!data.session)throw new ShareError(401,"login_required");return data.session.access_token;}
let pending:{fingerprint:string;requestId:string;token:string;id?:string}|null=null;
export async function publishPractice(bytes:Uint8Array,fingerprint:string):Promise<{id:string;link:string}>{
  if(pending?.fingerprint!==fingerprint)pending={fingerprint,requestId:crypto.randomUUID(),token:newShareToken()};
  const draft=pending,form=new FormData();form.set("requestId",draft.requestId);form.set("token",draft.token);form.set("package",new Blob([new Uint8Array(bytes).buffer],{type:"application/octet-stream"}),"practice.dolcepractice");
  const data=await (await shareRequest("create",form,await access())).json() as {id:string};
  localStorage.setItem(`dolce-choir-share:${data.id}`,draft.token);draft.id=data.id;return {id:data.id,link:shareLink(draft.token)};
}
export interface ShareRecord{id:string;title:string;fingerprint:string;state:string;created_at:string;revoked_at:string|null}
export async function listShares(offset=0):Promise<{items:ShareRecord[];nextOffset:number|null}>{return (await shareRequest("list",JSON.stringify({offset}),await access())).json();}
export async function revokeShare(id:string):Promise<void>{await shareRequest("revoke",JSON.stringify({id}),await access());localStorage.removeItem(`dolce-choir-share:${id}`);if(pending?.id===id)pending=null;}
export function storedShareLink(id:string):string|null{const token=localStorage.getItem(`dolce-choir-share:${id}`);return token?shareLink(token):null;}
