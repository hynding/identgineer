const fs=require('fs'),path=require('path');
const [dir,...tags]=process.argv.slice(2);
function clos(start){const seen=new Set(),q=[start];for(const n of q){if(seen.has(n))continue;seen.add(n);const t=fs.readFileSync(path.join(dir,n),'utf8');for(const m of t.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.m?js)["']/g))if(fs.existsSync(path.join(dir,m[1])))q.push(m[1]);}return [...seen];}
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.entry.js'));
for(const tag of tags){const e=files.find(f=>new RegExp('\\b'+tag.replace(/-/g,'_')+'\\b').test(fs.readFileSync(path.join(dir,f),'utf8')));const c=clos(e);console.log(tag,e,c.length,c.reduce((s,n)=>s+fs.statSync(path.join(dir,n)).size,0));}
