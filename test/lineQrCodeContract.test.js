import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LINE_TOOLS,LINE_METHODS} from '../src/lineTools.js';
import {SlimWebBackendRepository} from '../src/backendRepository.js';
import {createCapabilityToolProfile} from '../src/capabilityProfile.js';

test('LINE QR tool stays server generated, authorized and capability gated',async()=>{
 const tool=LINE_TOOLS.find(t=>t.name==='slimweb_line_bot_qrcode_get');assert.ok(tool);
 assert.equal(LINE_METHODS[tool.name],'getLineBotQrCode');
 assert.equal(tool.annotations.readOnlyHint,false);
 assert.equal(tool.annotations.idempotentHint,true);
 assert.deepEqual(tool.inputSchema.required,['site_id']);
 assert.equal(tool.inputSchema.properties.access_token,undefined);
 assert.match(tool.description,/quiet.zone/i);
 assert.equal(createCapabilityToolProfile(['line_bot_qrcode']).allows(tool.name),true);
 assert.equal(createCapabilityToolProfile(['line_bot_settings_read']).allows(tool.name),false);
 const calls=[];const repo=new SlimWebBackendRepository({transport:{async request(o){calls.push(o);return {add_friend_url:'https://line.me/R/ti/p/%40bot'};}}});
 await repo.getLineBotQrCode({site:{site_code:'owned'}},{site_code:'foreign'});
 assert.equal(calls[0].path,'/internal/mcp/v1/sites/owned/integrations/line-bot/qrcode');
 assert.equal(calls[0].method,'POST');assert.equal(calls[0].permission,'integration_settings');
});
