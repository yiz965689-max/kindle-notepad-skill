import {readdir,readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];let count=0;
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 const p=path.join(dir,entry.name),rel=path.relative(root,p);
 if(entry.name==='.git')continue;
 if((await lstat(p)).isSymbolicLink()){failures.push(`${rel}: symlink`);continue;}
 if(/^(node_modules|data|private|device-stage)$/.test(entry.name)||/^(secrets\.json|private-access\.txt|device-curl\.conf|task-meta|cached-screen\.png)$/.test(entry.name)||/\.(log|pem|key|zip)$/.test(entry.name)){failures.push(`${rel}: private/generated path`);continue;}
 if(entry.isDirectory()){await walk(p);continue;}
 count++;
 if(entry.name.endsWith('.otf'))continue;
 const text=await readFile(p,'utf8');
 // Never print matching content; it could itself be a secret.
 if(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)||/https?:\/\/[^\s]+#key=[a-f0-9]{32,}/i.test(text)||/\/Users\/[A-Za-z][^\s/]*/.test(text))failures.push(`${rel}: possible private material`);
 for(const token of text.match(/\b[a-f0-9]{64}\b/gi)||[])if(new Set(token).size>8)failures.push(`${rel}: possible credential (review privately)`);
 }}
await walk(root);
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Release audit passed: ${count} files; no matching private/generated content. Manual review still required.`);
