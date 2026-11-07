import {pathToFileURL} from 'node:url';

/** Fail before bundling: VITE values become public bytes, including unused secret fields. */
export function checkPublicConfig(env,required=false){
  for(const [name,value] of Object.entries(env)){
    if(!name.startsWith('VITE_')||!value)continue;
    if(/SERVICE_ROLE|SECRET/i.test(name)||String(value).startsWith('sb_secret_'))throw new Error('Server credential in public build configuration');
    if(String(value).startsWith('eyJ')){
      let data;try{data=JSON.parse(Buffer.from(String(value).split('.')[1],'base64url').toString());}catch{throw new Error('Invalid public JWT configuration');}
      if(data.role!=='anon')throw new Error('Non-anonymous JWT in public build configuration');
    }
  }
  const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
  if(!url||!key){if(required||url||key)throw new Error('Configure both public Supabase URL and publishable/anon key');return;}
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))throw new Error('Invalid public Supabase URL');
  if(!String(key).startsWith('sb_publishable_')&&!String(key).startsWith('eyJ'))throw new Error('Expected a Supabase publishable or anon key');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkPublicConfig(process.env,process.argv.includes('--require-sharing'));
