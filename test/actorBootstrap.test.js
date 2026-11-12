import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SlimWebBackendRepository} from '../src/backendRepository.js';

test('repository obtains identity authority from backend proof bootstrap, then discovers only scoped sites',async()=>{
  const calls=[];
  const repository=new SlimWebBackendRepository({transport:{
    async bootstrapIdentity(input){calls.push(input);return {profile:{sub:'verified',email:'verified@example.test',name:'Owner'},backend_grant:'opaque-verified'};},
    async request(input){calls.push(input);return {sites:[{site_code:'swcb_owned'}]};}
  }});
  const output=await repository.bootstrapIdentity({credential:'google-proof',profile:{sub:'caller'},resourceContext:'shop.example.test'});
  assert.equal(output.profile.sub,'verified');
  assert.equal(output.backend_grant,'opaque-verified');
  assert.equal(output.sites[0].site_code,'swcb_owned');
  assert.equal(calls[1].identity.google_id,'verified');
  assert.equal(calls[1].identity.backend_grant,'opaque-verified');
  assert.equal(calls[1].identity.resource_context,'shop.example.test');
});

test('production repository refuses bootstrap without backend-issued authority',async()=>{
  const repository=new SlimWebBackendRepository({transport:{async request(){return {sites:[]};}}});
  await assert.rejects(repository.bootstrapIdentity({credential:'proof'}),e=>e.code==='IDENTITY_BOOTSTRAP_REQUIRED');
});
