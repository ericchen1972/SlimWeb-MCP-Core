import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderOAuthConsentPage} from '../src/oauthConsentPage.js';

const input = {zh:true, clientName:'Codex <script>alert(1)</script>', email:'owner@example.com', sites:[{name:'Shop <one>'}], redirectUri:'http://127.0.0.1:1234/callback?a=1&b=2', action:'/oauth/authorize?domain=shop.example', consentToken:'test-token'};
test('consent page escapes dynamic data and preserves native authorization fields', () => {
  const html=renderOAuthConsentPage(input);
  assert.ok(!html.includes('<script>'));
  assert.match(html,/Codex &lt;script&gt;/);
  assert.match(html,/Shop &lt;one&gt;/);
  assert.match(html,/method="post" action="\/oauth\/authorize\?domain=shop.example"/);
  assert.match(html,/name="consent_token" value="test-token"/);
  for(const decision of ['allow','deny']) assert.ok(html.includes(`name="decision" value="${decision}"`));
  assert.match(html,/<details[\s>]/);
  assert.ok(html.includes('http://127.0.0.1:1234/callback?a=1&amp;b=2'));
});
test('consent page localizes account, scope and actions', () => {
  const zh=renderOAuthConsentPage(input);
  const en=renderOAuthConsentPage({...input,zh:false});
  assert.match(zh,/lang="zh-Hant"/);
  assert.match(zh,/允許授權/);
  assert.match(en,/lang="en"/);
  assert.match(en,/Allow access/);
  assert.match(en,/orders, members, content and integration settings/);
});
