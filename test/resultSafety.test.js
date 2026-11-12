import test from 'node:test';
import assert from 'node:assert/strict';
import { redactToolResult } from '../src/resultSafety.js';

test('recursive result defense removes secret aliases including JSON text mirrors', () => {
 const result = redactToolResult({structuredContent: {nested: [{notion_token:'x', notificationSmtpPassword:'x', line_bot_channel_secret:'x', accessToken:'x', api_key:'x', hash_iv:'x'}]}, content:[{type:'text',text:JSON.stringify({password:'x', safe:'ok'})}]});
 assert.deepEqual(result.structuredContent.nested, [{}]);
 assert.deepEqual(JSON.parse(result.content[0].text), {safe:'ok'});
});

test('public identifiers, currency, Notion content and real setup booleans survive', () => {
 const safe = {site_code:'public', client_id:'public', line_bot_user_id:'public', currency:'TWD', google_search_engine_id:'public', has_notion_token:true, hasNotificationSmtpPassword:false, notion:{title:'Safe text', content:'A token is a word.'}, nonce:'public-operation'};
 assert.deepEqual(redactToolResult(safe), safe);
 assert.deepEqual(redactToolResult({has_notion_token:'leaked', has_api_key:{value:'leaked'}}), {});
});

test('does not mutate source payload and handles dangerous object keys safely', () => {
 const input = JSON.parse('{"__proto__":{"secret":"x"},"safe":{"password":"x","id":1}}');
 const result = redactToolResult(input);
 assert.equal(Object.getPrototypeOf(result), Object.prototype);
 assert.equal(result.safe.id, 1);
 assert.equal(input.safe.password, 'x');
 assert.equal(Object.hasOwn(result, '__proto__'), false);
});
