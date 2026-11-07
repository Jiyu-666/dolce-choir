// Real local Supabase only. OAuth identities are database fixtures, not a claim of production OAuth validation.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {verifyLiveSharing} from './sharing-browser.mjs';
const {env}=JSON.parse(await readFile('out/supabase-status.json','utf8'));
const url=env.API_URL,key=env.ANON_KEY??env.PUBLISHABLE_KEY,secret=env.SERVICE_ROLE_KEY??env.SECRET_KEY;
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Integration test requires an isolated local Supabase');
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,secret,options),anonymous=createClient(url,key,options);
const users=[],records=[],paths=[];
const bucket=admin.storage.from('choir-practice-v1'),sample=new Uint8Array(await readFile('public/choir/demo.dolcepractice'));
const token=()=>randomBytes(24).toString('base64url');
const hash=t=>createHash('sha256').update(t).digest('hex');
async function fixture(claims={}){
  const email=`choir-${randomUUID()}@example.test`,password=`${randomUUID()}Aa1!`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:claims});if(created.error)throw new Error(`Auth fixture failed: ${created.error.message}`);
  users.push(created.data.user.id);const client=createClient(url,key,options),login=await client.auth.signInWithPassword({email,password});if(login.error)throw new Error('Fixture sign-in failed');
  return {id:created.data.user.id,access:login.data.session.access_token,refresh:login.data.session.refresh_token};
}
async function request(action,body,access){
  const headers={apikey:key};if(access)headers.authorization=`Bearer ${access}`;
  if(!(body instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(body);}
  return fetch(`${url}/functions/v1/choir-api/${action}`,{method:'POST',headers,body});
}
function publication(requestId,t,bytes=sample){const form=new FormData();form.set('requestId',requestId);form.set('token',t);form.set('package',new Blob([bytes],{type:'application/octet-stream'}),'practice.dolcepractice');return form;}
try{
  const owner=await fixture(),other=await fixture({provider:'github',sub:'138117377',role:'maintainer'});
  const sql=`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at) values ('${randomUUID()}','${owner.id}','138117377','github','{"sub":"138117377","provider_id":"138117377"}',now(),now());`;
  await writeFile('out/share-identity-fixture.sql',sql);
  const seeded=spawnSync('node_modules/.bin/supabase',['db','query','--file','out/share-identity-fixture.sql'],{encoding:'utf8',env:{...process.env,SUPABASE_HOME:`${process.cwd()}/out/supabase-home`}});
  if(seeded.status!==0)throw new Error(`Local identity fixture failed: ${seeded.stderr.slice(-500)}`);
  assert((await anonymous.from('choir_shares').select('id')).error,'Anonymous database enumeration was allowed');
  assert.equal((await request('list',{})).status,401);
  assert.equal((await request('create',publication(randomUUID(),token()),other.access)).status,403,'Editable metadata granted publishing');
  const requestId=randomUUID(),t=token(),created=await request('create',publication(requestId,t),owner.access);
  const creation=await created.json();assert.equal(created.status,200,`Create failed: ${JSON.stringify(creation)}`);records.push(creation.id);
  const row=await admin.from('choir_shares').select('*').eq('id',creation.id).single();assert(!row.error);paths.push(row.data.storage_path);
  assert.equal(row.data.token_hash,hash(t));assert(!Object.values(row.data).includes(t),'Raw token stored in database');
  const replay=await request('create',publication(requestId,t),owner.access);assert.equal(replay.status,200);assert.equal((await replay.json()).id,creation.id);
  const read=await request('resolve',{token:t});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');assert.deepEqual(new Uint8Array(await read.arrayBuffer()),sample);
  assert.equal((await request('resolve',{token:token()})).status,404);
  assert((await anonymous.storage.from('choir-practice-v1').download(row.data.storage_path)).error);
  const listing=await anonymous.storage.from('choir-practice-v1').list();assert(listing.error||listing.data.length===0,'Anonymous storage enumeration');
  const foreignId=randomUUID(),foreignPath=`${foreignId}.dolcepractice`;records.push(foreignId);paths.push(foreignPath);
  const inserted=await admin.from('choir_shares').insert({id:foreignId,owner_id:other.id,request_id:randomUUID(),title:'Other owner fixture',package_version:1,fingerprint:row.data.fingerprint,token_hash:hash(token()),storage_path:foreignPath,state:'ready'});assert(!inserted.error);
  assert.equal((await request('revoke',{id:foreignId},owner.access)).status,404,'Owner filter was bypassed');
  const mine=await request('list',{},owner.access);assert.equal(mine.status,200);const items=(await mine.json()).items;assert(items.some(r=>r.id===creation.id));assert(!items.some(r=>r.id===foreignId));
  const invalidId=randomUUID();assert.equal((await request('create',publication(invalidId,token(),new Uint8Array([1,2,3])),owner.access)).status,400);
  assert.equal((await admin.from('choir_shares').select('id').eq('request_id',invalidId)).data.length,0);
  const limit=await admin.storage.updateBucket('choir-practice-v1',{fileSizeLimit:1});assert(!limit.error);
  const failureId=randomUUID();
  try{assert.equal((await request('create',publication(failureId,token()),owner.access)).status,503);assert.equal((await admin.from('choir_shares').select('id').eq('request_id',failureId)).data.length,0,'Failed upload left a row');}
  finally{await admin.storage.updateBucket('choir-practice-v1',{fileSizeLimit:10485760});}
  assert.equal((await request('revoke',{id:creation.id},owner.access)).status,200);assert.equal((await request('resolve',{token:t})).status,404);
  if(process.argv.includes('--browser'))await verifyLiveSharing(env,{access_token:owner.access,refresh_token:owner.refresh});
  console.log('PASS: real local Auth/database/private Storage/Edge create+idempotency+resolve+list+revoke; anonymous, non-maintainer, cross-owner and failed-upload cleanup checks. OAuth fixture was seeded; production OAuth remains unverified.');
}finally{
  await admin.storage.updateBucket('choir-practice-v1',{fileSizeLimit:10485760});
  if(users.length){const owned=await admin.from('choir_shares').select('storage_path').in('owner_id',users);if(owned.data)paths.push(...owned.data.map(r=>r.storage_path));}
  if(paths.length)await bucket.remove([...new Set(paths)]);if(records.length)await admin.from('choir_shares').delete().in('id',records);
  for(const id of users)await admin.auth.admin.deleteUser(id);
}
