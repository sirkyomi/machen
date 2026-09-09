const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {Store,parse,serialize,today}=require('../electron/store.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'machen-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('todo.txt parses dates, projects, context and completed priority',()=>{const t=parse('(A) 2026-09-08 Bericht +Arbeit @mail due:2026-09-10 id:abc');assert.equal(t.title,'Bericht +Arbeit @mail');assert.equal(t.due,'2026-09-10');assert.equal(serialize(t),'(A) 2026-09-08 Bericht +Arbeit @mail due:2026-09-10 id:abc');const c=parse('x 2026-09-09 2026-09-08 Bericht pri:A id:abc');assert.equal(c.priority,'A');assert.equal(c.completed,'2026-09-09');assert.equal(serialize(c),'x 2026-09-09 2026-09-08 Bericht pri:A id:abc');});
test('create, edit, completion, reopen, deletion and context survive restart',t=>{const dir=fixture(t);let s=new Store(dir);s.mutate('create',{title:'Angebot +Büro',notes:'E-Mail\nHallo',priority:'A'});let task=s.snapshot().tasks[0];s.mutate('toggle',{id:task.id});s.mutate('toggle',{id:task.id});s=new Store(dir);assert.equal(s.snapshot().tasks[0].notes,'E-Mail\nHallo');assert.equal(s.snapshot().tasks[0].done,false);assert.equal(s.snapshot().events.length,3);s.mutate('edit',{id:task.id,title:'Angebot senden',notes:'Neu'});s.mutate('delete',{id:task.id});s=new Store(dir);assert.equal(s.snapshot().tasks.length,0);assert.equal(s.snapshot().events.at(-1).type,'delete');});
test('external edits survive next write; missing ids are stable in memory',t=>{const dir=fixture(t);const s=new Store(dir);fs.writeFileSync(s.file,'2026-09-08 Extern +Arbeit\n');const id=s.snapshot().tasks[0].id;assert.equal(s.snapshot().tasks[0].id,id);s.mutate('create',{title:'Intern'});assert.equal(new Store(dir).snapshot().tasks.length,2);assert.match(fs.readFileSync(s.file,'utf8'),/Extern \+Arbeit/);});
test('invalid multiline input does not modify the file',t=>{const s=new Store(fixture(t));assert.throws(()=>s.mutate('create',{title:'one\ntwo'}));assert.equal(s.snapshot().tasks.length,0);assert.equal(fs.readFileSync(s.file,'utf8'),'');});
test('write-ahead record recovers an interrupted transaction',t=>{const dir=fixture(t);fs.writeFileSync(path.join(dir,'todo.txt'),'');fs.writeFileSync(path.join(dir,'.machen.json'),JSON.stringify({version:1,context:{},events:[],pending:`${today()} Gerettet id:abc\n`}));assert.equal(new Store(dir).snapshot().tasks[0].title,'Gerettet');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'.machen.json'))).pending,undefined);});
test('attachments are copied and resolved by known ids',t=>{const dir=fixture(t);const s=new Store(dir);s.mutate('create',{title:'Datei prüfen'});const id=s.snapshot().tasks[0].id;const source=path.join(dir,'mail.eml');fs.writeFileSync(source,'Subject: Hallo');s.attach(id,[source]);const file=s.snapshot().tasks[0].files[0];fs.unlinkSync(source);assert.equal(fs.readFileSync(s.attachment(id,file.id),'utf8'),'Subject: Hallo');assert.throws(()=>s.attachment(id,'../../secret'));});
test('archive, restore and reopen preserve metadata and never duplicate tasks',t=>{
 const dir=fixture(t);let s=new Store(dir);s.mutate('create',{title:'Anrufen +Arbeit @Telefon',notes:'Details',priority:'A'});
 const id=s.snapshot().tasks[0].id;assert.throws(()=>s.mutate('archive',{id}));
 s.mutate('toggle',{id});s.mutate('archiveCompleted',{});s=new Store(dir);
 assert.equal(s.snapshot().tasks.length,0);assert.equal(s.snapshot().archived.length,1);assert.equal(s.snapshot().archived[0].notes,'Details');
 assert.match(fs.readFileSync(path.join(dir,'done.txt'),'utf8'),/^x .*@Telefon/);
 s.mutate('restore',{id});assert.equal(s.snapshot().archived.length,0);assert.equal(s.snapshot().tasks[0].done,true);
 s.mutate('archive',{id});s.mutate('toggle',{id});assert.equal(s.snapshot().tasks[0].done,false);assert.equal(s.snapshot().archived.length,0);
});
test('interrupted two-file archival recovers both todo.txt and done.txt',t=>{
 const dir=fixture(t);new Store(dir);
 const meta={version:1,context:{abc:{notes:'Keep me'}},events:[],pending:{todo:'',done:'x 2026-09-09 2026-09-08 Done @Telefon id:abc\n'}};
 fs.writeFileSync(path.join(dir,'todo.txt'),'2026-09-08 Done id:abc\n');fs.writeFileSync(path.join(dir,'.machen.json'),JSON.stringify(meta));
 const s=new Store(dir);assert.equal(s.snapshot().tasks.length,0);assert.equal(s.snapshot().archived[0].notes,'Keep me');assert.equal(s.snapshot().archived[0].id,'abc');
});
test('external archive edits are retained and history metadata remains available',t=>{
 const dir=fixture(t),s=new Store(dir);fs.writeFileSync(path.join(dir,'done.txt'),'x 2026-09-08 External id:ext\n');
 s.mutate('create',{title:'New'});assert.equal(s.snapshot().archived[0].title,'External');
 s.mutate('restore',{id:'ext'});assert.equal(s.snapshot().tasks.length,2);assert.equal(fs.readFileSync(path.join(dir,'done.txt'),'utf8'),'');
});
