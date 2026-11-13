import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
const directory='/workspace/our-house-shots';
const failures=[];
for(const script of ['tests/e2e.mjs','tests/sharing.mjs']){
 const result=spawnSync(process.execPath,[script],{stdio:'inherit',env:process.env});
 if(result.status!==0)failures.push(script);
}
const ui=JSON.parse(await fs.readFile(`${directory}/test-results.json`,'utf8'));
const sharing=JSON.parse(await fs.readFile(`${directory}/sharing-test-results.json`,'utf8'));
ui.checks.push(...sharing.checks.map(check=>({...check,name:`[SDK transport double] ${check.name}`})));
ui.pass=ui.pass&&sharing.pass&&failures.length===0;
ui.summary={passed:ui.checks.filter(x=>x.pass).length,total:ui.checks.length};
ui.sharingVerification=sharing.type;
await fs.writeFile(`${directory}/test-results.json`,JSON.stringify(ui,null,2));
console.log(`Our House: ${ui.summary.passed}/${ui.summary.total} checks passed. Real Firebase service still needs post-configuration smoke testing.`);
if(!ui.pass)process.exitCode=1;
