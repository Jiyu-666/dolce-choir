/** Operate on the verified Auth server response, never client roles or editable user_metadata. */
export function maintainerId(user:unknown):string|null{
  if(!user||typeof user!=="object")return null;
  const u=user as {id?:unknown;identities?:{provider?:unknown;identity_data?:{sub?:unknown;provider_id?:unknown}}[]};
  if(typeof u.id!=="string"||!Array.isArray(u.identities))return null;
  return u.identities.some(i=>i.provider==="github"&&String(i.identity_data?.provider_id??i.identity_data?.sub)==="138117377")?u.id:null;
}
export function newShareToken():string{
  const bytes=crypto.getRandomValues(new Uint8Array(24));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function validShareToken(value:unknown):value is string{return typeof value==="string"&&/^[A-Za-z0-9_-]{32}$/.test(value);}
export async function shareTokenHash(token:string):Promise<string>{
  if(!validShareToken(token))throw new Error("Invalid share token");
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function readLimitedBody(request:Request,maxBytes:number):Promise<Uint8Array>{
  const length=Number(request.headers.get("content-length")??0);if(length>maxBytes)throw new Error("Body too large");
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Error("Body too large");}chunks.push(value);}
  const result=new Uint8Array(size);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
}
