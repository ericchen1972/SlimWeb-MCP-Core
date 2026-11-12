import {createHash} from 'node:crypto';

// Process ingress defense. Distributed tenant/category budgets are enforced by the backend.
export function createToolLimiter({now=Date.now,maxCalls=120,maxConcurrent=8,maxKeys=10000}={}) {
  const entries=new Map();
  const error=(code,retry)=>Object.assign(new Error('Tool request budget is temporarily exhausted.'),{code,details:{retry_after:retry}});
  return {
    acquire(identity) {
      const clock=now(),window=Math.floor(clock/60000);
      const key=createHash('sha256').update(JSON.stringify([identity.google_id,identity.email,identity.resource_context??null])).digest('hex');
      let entry=entries.get(key);
      if(!entry) {
        if(entries.size>=maxKeys)for(const [k,v] of entries)if(v.window<window&&v.concurrent===0)entries.delete(k);
        if(entries.size>=maxKeys)throw error('LIMITER_UNAVAILABLE',60);
        entry={window,count:0,concurrent:0};entries.set(key,entry);
      }
      if(entry.window!==window){entry.window=window;entry.count=0;}
      if(entry.count>=maxCalls||entry.concurrent>=maxConcurrent)throw error('RATE_LIMIT_EXCEEDED',Math.max(1,60-Math.floor(clock/1000)%60));
      entry.count++;entry.concurrent++;
      let released=false;
      return ()=>{if(!released){released=true;entry.concurrent--;}};
    }
  };
}
