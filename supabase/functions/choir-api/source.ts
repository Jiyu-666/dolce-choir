import {createClient} from "@supabase/supabase-js";
import {readPracticePackage} from "../../../src/choir/package";
import {maintainerId,validShareToken,shareTokenHash,readLimitedBody} from "../../../src/choir/share-contract";

const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=client.storage.from("choir-practice-v1");
const origins=(Deno.env.get("CHOIR_ALLOWED_ORIGINS")??"http://127.0.0.1:1420,http://localhost:1420").split(",");
class HttpError extends Error{constructor(readonly status:number,readonly code:string){super(code);}}
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function owner(request:Request):Promise<string>{
  const match=/^Bearer (.+)$/.exec(request.headers.get("authorization")??"");if(!match)throw new HttpError(401,"login_required");
  const {data,error}=await client.auth.getUser(match[1]);if(error)throw new HttpError(401,"invalid_session");
  const id=maintainerId(data.user);if(!id)throw new HttpError(403,"maintainer_required");return id;
}
async function jsonBody(request:Request):Promise<Record<string,unknown>>{
  try{const value=JSON.parse(new TextDecoder().decode(await readLimitedBody(request,2048)));if(!value||typeof value!=="object"||Array.isArray(value))throw 0;return value;}catch{throw new HttpError(400,"invalid_request");}
}
Deno.serve(async request=>{
  const started=performance.now(),name=new URL(request.url).pathname.split("/").pop()??"";
  const action=["create","list","revoke","resolve"].includes(name)?name:"unknown";
  const origin=request.headers.get("origin"),headers:Record<string,string>={"cache-control":"no-store","vary":"Origin"};
  if(origin&&origins.includes(origin))headers["access-control-allow-origin"]=origin;
  headers["access-control-allow-headers"]="authorization,apikey,content-type,x-client-info";headers["access-control-allow-methods"]="POST,OPTIONS";
  let status=200,recordId:string|undefined;
  const response=(value:unknown,code=200)=>new Response(JSON.stringify(value),{status:code,headers:{...headers,"content-type":"application/json"}});
  try{
    if(origin&&!origins.includes(origin))throw new HttpError(403,"origin_denied");
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(request.method!=="POST")throw new HttpError(405,"method_not_allowed");
    if(action==="resolve"){
      const body=await jsonBody(request);if(!validShareToken(body.token))throw new HttpError(404,"not_found");
      const tokenHash=await shareTokenHash(body.token);
      const {data,error}=await client.from("choir_shares").select("id,storage_path").eq("token_hash",tokenHash).eq("state","ready").is("revoked_at",null).maybeSingle();
      if(error)throw new HttpError(503,"unavailable");if(!data)throw new HttpError(404,"not_found");recordId=data.id;
      const object=await bucket.download(data.storage_path);if(object.error)throw new HttpError(503,"unavailable");
      return new Response(object.data,{headers:{...headers,"content-type":"application/octet-stream","x-content-type-options":"nosniff"}});
    }
    const user=await owner(request);
    if(action==="list"){
      const body=await jsonBody(request),offset=body.offset??0;if(typeof offset!=="number"||!Number.isSafeInteger(offset)||offset<0)throw new HttpError(400,"invalid_request");
      const {data,error,count}=await client.from("choir_shares").select("id,title,package_version,fingerprint,state,created_at,revoked_at",{count:"exact"}).eq("owner_id",user).order("created_at",{ascending:false}).range(offset,offset+49);
      if(error)throw new HttpError(503,"unavailable");return response({items:data,nextOffset:count!==null&&offset+data.length<count?offset+data.length:null});
    }
    if(action==="revoke"){
      const body=await jsonBody(request);if(!uuid(body.id))throw new HttpError(400,"invalid_request");
      const {data,error}=await client.from("choir_shares").select("id,revoked_at").eq("id",body.id).eq("owner_id",user).maybeSingle();
      if(error)throw new HttpError(503,"unavailable");if(!data)throw new HttpError(404,"not_found");recordId=data.id;
      if(!data.revoked_at){const update=await client.from("choir_shares").update({revoked_at:new Date().toISOString()}).eq("id",data.id).eq("owner_id",user);if(update.error)throw new HttpError(503,"unavailable");}
      return response({revoked:true});
    }
    if(action!=="create")throw new HttpError(404,"not_found");
    const bytes=await readLimitedBody(request,10*1024*1024+65536).catch(()=>{throw new HttpError(413,"package_too_large");});
    const form=await new Response(new Uint8Array(bytes).buffer,{headers:{"content-type":request.headers.get("content-type")??""}}).formData().catch(()=>{throw new HttpError(400,"invalid_request");});
    const token=form.get("token"),requestId=form.get("requestId"),file=form.get("package");
    if(!validShareToken(token)||!uuid(requestId)||!(file instanceof File)||file.size>10*1024*1024)throw new HttpError(400,"invalid_request");
    const payload=new Uint8Array(await file.arrayBuffer());
    const parsed=await readPracticePackage(payload).catch(()=>{throw new HttpError(400,"invalid_package");});
    const fingerprint=parsed.package.fingerprint,tokenHash=await shareTokenHash(token);
    const existing=await client.from("choir_shares").select("id,state,fingerprint,token_hash,revoked_at").eq("owner_id",user).eq("request_id",requestId).maybeSingle();
    if(existing.error)throw new HttpError(503,"unavailable");
    if(existing.data){
      const row=existing.data;recordId=row.id;
      if(row.token_hash!==tokenHash||row.fingerprint!==fingerprint||row.revoked_at)throw new HttpError(409,"request_conflict");
      if(row.state!=="ready")throw new HttpError(409,"publication_pending");return response({id:row.id,fingerprint});
    }
    const id=crypto.randomUUID(),path=`${id}.dolcepractice`;recordId=id;
    const inserted=await client.from("choir_shares").insert({id,owner_id:user,request_id:requestId,title:parsed.package.title,package_version:1,fingerprint,storage_path:path,token_hash:tokenHash});
    if(inserted.error)throw new HttpError(inserted.error.code==="23505"?409:503,"publication_conflict");
    try{
      const upload=await bucket.upload(path,payload,{contentType:"application/octet-stream",upsert:false,cacheControl:"0"});if(upload.error)throw upload.error;
      const ready=await client.from("choir_shares").update({state:"ready"}).eq("id",id).is("revoked_at",null).select("id").single();if(ready.error)throw ready.error;
    }catch{
      // Never delete an object whose ready commit may have succeeded despite a lost response.
      const current=await client.from("choir_shares").select("state").eq("id",id).maybeSingle();
      if(!current.error&&current.data?.state!=="ready"){
        const removed=await bucket.remove([path]);if(!removed.error)await client.from("choir_shares").delete().eq("id",id).eq("state","creating");
      }
      throw new HttpError(503,"publication_failed");
    }
    return response({id,fingerprint});
  }catch(error){status=error instanceof HttpError?error.status:500;return response({error:error instanceof HttpError?error.code:"internal_error"},status);}
  finally{console.log(JSON.stringify({action,status,ms:Math.round(performance.now()-started),...(recordId?{recordId}:{})}));}
});
