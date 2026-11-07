export function shareConfig():{url:string;key:string;endpoint:string}|null{
  const url=import.meta.env.VITE_SUPABASE_URL as string|undefined,key=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??import.meta.env.VITE_SUPABASE_ANON_KEY) as string|undefined;
  if(!url||!key)return null;
  if(key.startsWith("sb_secret_"))throw new Error("Server credential in public configuration");
  if(key.startsWith("eyJ")){
    try{const data=JSON.parse(atob(key.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));if(data.role!=="anon")throw new Error("Not an anonymous key");}
    catch{throw new Error("Invalid public key configuration");}
  }
  const parsed=new URL(url);if(parsed.protocol!=="https:"&&!(parsed.protocol==="http:"&&["localhost","127.0.0.1"].includes(parsed.hostname)))throw new Error("Invalid Supabase URL");
  return {url:url.replace(/\/$/,""),key,endpoint:`${url.replace(/\/$/,"")}/functions/v1/choir-api/`};
}
export class ShareError extends Error{constructor(readonly status:number,readonly code:string){super(code);}}
export async function shareRequest(action:string,body:BodyInit,accessToken?:string):Promise<Response>{
  const config=shareConfig();if(!config)throw new ShareError(503,"not_configured");
  const headers:Record<string,string>={apikey:config.key};if(accessToken)headers.authorization=`Bearer ${accessToken}`;
  if(typeof body==="string")headers["content-type"]="application/json";
  const response=await fetch(config.endpoint+action,{method:"POST",headers,body,cache:"no-store"});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new ShareError(response.status,typeof data.error==="string"?data.error:"unavailable");}
  return response;
}
