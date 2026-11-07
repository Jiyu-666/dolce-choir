import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPublicConfig} from '../scripts/choir-build-config.mjs';
const url='https://example.supabase.co',jwt=role=>`eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({role})).toString('base64url')}.fixture`;
test('unconfigured local builds work; production requires a public key pair',()=>{
  checkPublicConfig({});assert.throws(()=>checkPublicConfig({},true));
  checkPublicConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},true);
  checkPublicConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:jwt('anon')},true);
  assert.throws(()=>checkPublicConfig({VITE_SUPABASE_URL:url}));
});
test('secret values and nonanonymous JWTs cannot enter the browser bundle',()=>{
  for(const env of [{VITE_SUPABASE_KEY:'sb_secret_fixture'},{VITE_OTHER:jwt('service_role')},{VITE_SERVICE_ROLE_KEY:'fixture'},{VITE_OTHER:'eyJinvalid'}])assert.throws(()=>checkPublicConfig(env));
  assert.throws(()=>checkPublicConfig({VITE_SUPABASE_URL:'http://example.test',VITE_SUPABASE_ANON_KEY:jwt('anon')}));
});
