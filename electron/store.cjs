const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function parse(line) {
  let rest = line.trim(), done = false, completed = '', created = '', priority = '';
  if (rest.startsWith('x ')) { done = true; rest = rest.slice(2); }
  if (/^\([A-Z]\) /.test(rest)) { priority = rest[1]; rest = rest.slice(4); }
  if (done && datePattern.test(rest.slice(0,10))) { completed = rest.slice(0,10); rest = rest.slice(11); }
  if (datePattern.test(rest.slice(0,10))) { created = rest.slice(0,10); rest = rest.slice(11); }
  const id = rest.match(/(?:^| )id:([^\s]+)/)?.[1] || randomUUID();
  const due = rest.match(/(?:^| )due:(\d{4}-\d{2}-\d{2})(?= |$)/)?.[1] || '';
  const scheduled = rest.match(/(?:^| )t:(\d{4}-\d{2}-\d{2})(?= |$)/)?.[1] || '';
  const previousPriority = rest.match(/(?:^| )pri:([A-Z])(?= |$)/)?.[1] || '';
  const title = rest.replace(/(?:^| )t:\d{4}-\d{2}-\d{2}(?= |$)/g,'').replace(/(?:^| )id:[^\s]+/g,'').replace(/(?:^| )due:\d{4}-\d{2}-\d{2}(?= |$)/g,'').replace(/(?:^| )pri:[A-Z](?= |$)/g,'').trim();
  return { id, title, done, completed, created, priority: priority || previousPriority, due, scheduled };
}
function serialize(t) {
  return [t.done ? 'x' : '', t.done ? t.completed : t.priority ? `(${t.priority})` : '', t.created,
    t.title, t.scheduled ? `t:${t.scheduled}` : '', t.due ? `due:${t.due}` : '', t.done && t.priority ? `pri:${t.priority}` : '', `id:${t.id}`].filter(Boolean).join(' ');
}
function atomic(file, text) { const temp = `${file}.${randomUUID()}.tmp`; fs.writeFileSync(temp,text,'utf8'); fs.renameSync(temp,file); }
class Store {
  constructor(dir) {
    this.dir = dir; this.file = path.join(dir,'todo.txt'); this.archiveFile = path.join(dir,'done.txt'); this.metaFile = path.join(dir,'.machen.json');
    fs.mkdirSync(dir,{recursive:true});
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file,'','utf8');
    if (!fs.existsSync(this.archiveFile)) fs.writeFileSync(this.archiveFile,'','utf8');
    this.meta = fs.existsSync(this.metaFile) ? JSON.parse(fs.readFileSync(this.metaFile,'utf8')) : {version:1,context:{},events:[]};
    if (this.meta.version !== 1 || !Array.isArray(this.meta.events) || !this.meta.context) throw Error('Die Begleitdatei hat ein unbekanntes Format.');
    if (this.meta.pending !== undefined) {
      const pending=this.meta.pending;
      atomic(this.file,typeof pending==='string'?pending:pending.todo);
      if(typeof pending==='object')atomic(this.archiveFile,pending.done);
      delete this.meta.pending; atomic(this.metaFile,JSON.stringify(this.meta,null,2));
    }
    this.raw = null; this.archiveRaw=null; this.tasks = []; this.archived=[]; this.refresh();
  }
  refresh() {
    const raw = fs.readFileSync(this.file,'utf8'),archiveRaw=fs.readFileSync(this.archiveFile,'utf8');
    if (raw === this.raw && archiveRaw===this.archiveRaw) return;
    if(raw!==this.raw)this.tasks=raw.split(/\r?\n/).filter(l=>l.trim()).map(parse);
    if(archiveRaw!==this.archiveRaw)this.archived=archiveRaw.split(/\r?\n/).filter(l=>l.trim()).map(parse);
    const seen = new Set();
    for(const t of [...this.tasks,...this.archived]){if(seen.has(t.id))t.id=randomUUID();seen.add(t.id);}
    this.raw = raw;this.archiveRaw=archiveRaw;
  }
  snapshot() { this.refresh();const enrich=t=>({...t,...(this.meta.context[t.id]||{})});return {tasks:this.tasks.map(enrich),archived:this.archived.map(t=>({...enrich(t),archived:true})),events:this.meta.events}; }
  commit() {
    if (fs.readFileSync(this.file,'utf8') !== this.raw || fs.readFileSync(this.archiveFile,'utf8')!==this.archiveRaw) { this.refresh(); throw Error('Die Datei wurde extern geändert. Bitte erneut versuchen.'); }
    const raw = this.tasks.map(serialize).join('\n') + (this.tasks.length?'\n':'');
    const archiveRaw=this.archived.map(serialize).join('\n')+(this.archived.length?'\n':'');
    fs.copyFileSync(this.file,`${this.file}.bak`);
    fs.copyFileSync(this.archiveFile,`${this.archiveFile}.bak`);
    atomic(this.metaFile,JSON.stringify({...this.meta,pending:{todo:raw,done:archiveRaw}},null,2));
    atomic(this.file,raw); this.raw = raw;
    atomic(this.archiveFile,archiveRaw);this.archiveRaw=archiveRaw;
    atomic(this.metaFile,JSON.stringify(this.meta,null,2));
  }
  mutate(action, data) {
    this.refresh(); const before = JSON.stringify({tasks:this.tasks,archived:this.archived,meta:this.meta});
    try {
      if(action==='archiveCompleted'){
        const done=this.tasks.filter(t=>t.done);this.archived.push(...done);this.tasks=this.tasks.filter(t=>!t.done);
        for(const t of done)this.meta.events.push({id:randomUUID(),taskId:t.id,title:t.title,day:today(),at:new Date().toISOString(),type:'archive'});
        if(done.length)this.commit();return this.snapshot();
      }
      let t = [...this.tasks,...this.archived].find(t=>t.id===data.id);
      if (action === 'create') {
        if(data.scheduled && (!datePattern.test(data.scheduled) || Number.isNaN(Date.parse(data.scheduled+'T12:00:00Z')) || new Date(data.scheduled+'T12:00:00Z').toISOString().slice(0,10)!==data.scheduled)) throw Error('Ungültiges Datum.');
        t = {id:randomUUID(),title:'',created:today(),completed:'',done:false,priority:'',due:'',scheduled:data.scheduled||''}; this.tasks.push(t); }
      if (!t) throw Error('Aufgabe nicht mehr vorhanden.');
      if (action === 'create' || action === 'edit') {
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 2000 || /[\r\n]/.test(data.title) || /(?:^|\s)(?:id|due|pri|t):/.test(data.title)) throw Error('Bitte einen Titel ohne reservierte id:, due: oder pri:-Felder eingeben.');
        if (data.priority && !/^[A-Z]$/.test(data.priority)) throw Error('Ungültige Priorität.');
        if (data.due && !datePattern.test(data.due)) throw Error('Ungültiges Datum.');
        if(data.scheduled && (!datePattern.test(data.scheduled) || Number.isNaN(Date.parse(data.scheduled+'T12:00:00Z')) || new Date(data.scheduled+'T12:00:00Z').toISOString().slice(0,10)!==data.scheduled)) throw Error('Ungültiges Datum.');
        Object.assign(t,{title:data.title.trim(),priority:data.priority||'',due:data.due||''});
        if(data.scheduled !== undefined) t.scheduled=data.scheduled||'';
        const old = this.meta.context[t.id]||{};
        this.meta.context[t.id] = {...old,notes:String(data.notes??old.notes??'').slice(0,100000)};
      } else if (action === 'toggle') { t.done = !t.done; t.completed = t.done ? today() : '';if(!t.done&&this.archived.includes(t)){this.archived=this.archived.filter(x=>x.id!==t.id);this.tasks.push(t);} }
      else if (action === 'delete') {this.tasks = this.tasks.filter(x=>x.id!==t.id);this.archived=this.archived.filter(x=>x.id!==t.id);}
      else if(action==='archive'){if(!t.done||!this.tasks.includes(t))throw Error('Nur erledigte Aufgaben lassen sich archivieren.');this.tasks=this.tasks.filter(x=>x.id!==t.id);this.archived.push(t);}
      else if(action==='restore'){if(!this.archived.includes(t))throw Error('Aufgabe ist nicht im Archiv.');this.archived=this.archived.filter(x=>x.id!==t.id);this.tasks.push(t);}
      else throw Error('Unbekannte Aktion.');
      this.meta.events.push({id:randomUUID(),taskId:t.id,title:t.title,day:today(),at:new Date().toISOString(),type:action==='toggle'?(t.done?'completed':'reopened'):action});
      this.commit(); return this.snapshot();
    } catch(e) { const b=JSON.parse(before); this.tasks=b.tasks;this.archived=b.archived; this.meta=b.meta; this.raw=null;this.archiveRaw=null; throw e; }
  }
  attach(id, files) {
    this.refresh(); if (![...this.tasks,...this.archived].some(t=>t.id===id)) throw Error('Aufgabe nicht gefunden.');
    const dir=path.join(this.dir,'attachments'); fs.mkdirSync(dir,{recursive:true});
    const context=this.meta.context[id] ||= {}; context.files ||= [];
    for (const file of files) { const name=path.basename(file); const stored=`${randomUUID()}${path.extname(name)}`; fs.copyFileSync(file,path.join(dir,stored)); context.files.push({id:randomUUID(),name,stored}); }
    this.commit(); return this.snapshot();
  }
  attachment(id,fileId) {
    const f=this.meta.context[id]?.files?.find(f=>f.id===fileId);
    if (!f || path.basename(f.stored)!==f.stored) throw Error('Datei nicht gefunden.');
    return path.join(this.dir,'attachments',f.stored);
  }
}
module.exports={Store,parse,serialize,today};
