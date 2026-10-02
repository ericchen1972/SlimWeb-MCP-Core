import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LINE_TOOLS, LINE_METHODS} from '../src/lineTools.js';
import {SlimWebBackendRepository} from '../src/backendRepository.js';
import {createCapabilityToolProfile} from '../src/capabilityProfile.js';

test('push tools require explicit review and bound five messages',()=>{
 const prepare=LINE_TOOLS.find(t=>t.name==='slimweb_line_push_prepare');
 assert.equal(prepare.inputSchema.properties.messages.maxItems,5);
 assert.match(prepare.description,/confirm/i);
 const send=LINE_TOOLS.find(t=>t.name==='slimweb_line_push_send');
 assert.ok(send.inputSchema.required.includes('review_hash'));
 assert.equal(send.inputSchema.properties.confirmed.const,true);
 for(const t of LINE_TOOLS) assert.ok(LINE_METHODS[t.name]);
 const profile=createCapabilityToolProfile(['line_friends_read']);
 assert.ok(profile.allows('slimweb_line_members_list'));
 assert.ok(!profile.allows('slimweb_line_push_send'));
});

test('repository binds push endpoints to authorized site and carries stable preparation key',async()=>{
 const calls=[]; const repo=new SlimWebBackendRepository({transport:{async request(o){calls.push(o);return {};}}});
 const actor={site:{site_code:'owned'}};
 await repo.prepareLinePush(actor,{site_id:9,site_code:'foreign',idempotency_key:'prepare-001',messages:[{type:'text',text:'Hi'}]});
 await repo.sendLinePush(actor,{operation_id:'123',review_hash:'a'.repeat(64),confirmed:true});
 assert.equal(calls[0].path,'/internal/mcp/v1/sites/owned/integrations/line-push/prepare');
 assert.equal(calls[0].idempotencyKey,'prepare-001');
 assert.equal(calls[1].path,'/internal/mcp/v1/sites/owned/integrations/line-push/123/send');
 assert.equal(calls[0].body.site_code,undefined);
 await assert.rejects(()=>repo.sendLinePush(actor,{operation_id:'123',confirmed:false}),/confirm/i);
});
