import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=readFileSync(path.join(root,'src/operation-policy.v1.json'));
const args=process.argv.slice(2);const check=args.includes('--check');
const targets=args.filter(v=>v!=='--check');
for(const target of (targets.length?targets:['../webless','../SlimWeb-Standalone'])){
 const output=path.resolve(root,target,'app/Services/Mcp/operation-policy.v1.json');
 if(check){if(!source.equals(readFileSync(output)))throw Error(`Operation policy differs: ${output}`);}
 else writeFileSync(output,source);
}
console.log(check?'Operation policy copies match.':'Operation policy copies synchronized.');
