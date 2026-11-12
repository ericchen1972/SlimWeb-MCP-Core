import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OPERATION_POLICY,operationAllowed} from '../src/operationPolicy.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target=path.resolve(root,process.argv[2]??'../webless');
const cases=[];
for(const operation of [...Object.keys(OPERATION_POLICY.operations),'unknown.operation']){
 const rule=OPERATION_POLICY.operations[operation];
 for(const permissions of [[],['system_admin'],...OPERATION_POLICY.roles.map(role=>[role]),...OPERATION_POLICY.roles.map(role=>['backend_ai_assistant',role]),OPERATION_POLICY.roles.filter(role=>role!=='system_admin'),...(rule?[rule.all,[...rule.all,...rule.any]]:[])]){
  for(const payload of [{},{messages:[{product_id:1}]}])cases.push({operation,permissions,payload});
 }
}
const php=`require $argv[1].'/app/Services/Mcp/McpOperationPolicy.php'; $cases=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR); echo json_encode(array_map(fn($c)=>App\\Services\\Mcp\\McpOperationPolicy::allows($c['permissions'],$c['operation'],$c['payload']),$cases),JSON_THROW_ON_ERROR);`;
const actual=JSON.parse(execFileSync('php',['-r',php,target],{input:JSON.stringify(cases),maxBuffer:8*1024*1024}));
for(let i=0;i<cases.length;i++){const c=cases[i];if(actual[i]!==operationAllowed(c.permissions,c.operation,c.payload))throw Error(`PHP/Core policy mismatch: ${JSON.stringify(c)}`);}
console.log(`${cases.length} PHP/Core permission decisions match: ${target}`);
