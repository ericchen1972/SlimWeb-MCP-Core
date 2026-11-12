import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createToolLimiter} from '../src/toolLimiter.js';

test('tool ingress budgets bind verified identity, count retries and recover after the window',()=>{
  let clock=0;
  const limiter=createToolLimiter({now:()=>clock,maxCalls:1});
  const identity={google_id:'verified-a',email:'a@example.test',resource_context:null};
  limiter.acquire(identity)();
  assert.throws(()=>limiter.acquire(identity),e=>e.code==='RATE_LIMIT_EXCEEDED'&&e.details.retry_after===60);
  limiter.acquire({...identity,google_id:'verified-b'})();
  clock=60000;
  limiter.acquire(identity)();
});

test('concurrency cannot be evicted by identity churn and releases once',()=>{
  const limiter=createToolLimiter({now:()=>0,maxConcurrent:1,maxKeys:1});
  const identity={google_id:'a',email:'a@example.test'};
  const release=limiter.acquire(identity);
  assert.throws(()=>limiter.acquire(identity),e=>e.code==='RATE_LIMIT_EXCEEDED');
  assert.throws(()=>limiter.acquire({...identity,google_id:'b'}),e=>e.code==='LIMITER_UNAVAILABLE');
  release();release();
  limiter.acquire(identity)();
});
