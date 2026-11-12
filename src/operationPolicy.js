import {readFileSync} from 'node:fs';
export const OPERATION_POLICY = Object.freeze(JSON.parse(readFileSync(new URL('./operation-policy.v1.json',import.meta.url),'utf8')));
if(OPERATION_POLICY.version!==1) throw new Error('Unsupported operation policy version.');
export function operationRequirement(operation){return OPERATION_POLICY.operations[operation] ?? null;}
export function operationAllowed(permissions,operation,payload={}){
 const rule=operationRequirement(operation);
 if(!rule)return false;
 const available=new Set(Array.isArray(permissions)?permissions.filter(p=>typeof p==='string'):[]);
 if(available.has('system_admin'))return true;
 return rule.all.every(p=>available.has(p)) && (rule.any.length===0 || rule.any.some(p=>available.has(p)))
  && (rule.requiresWhen??[]).every(condition=>!Array.isArray(payload[condition.array]) || !payload[condition.array].some(item=>item && Object.hasOwn(item,condition.key)) || operationAllowed(permissions,condition.operation,payload));
}
