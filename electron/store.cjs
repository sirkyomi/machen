const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
function normalizeSubtasks(value, previous = []) {
  if (value === undefined) return previous;
  if (!Array.isArray(value) || value.length > 100) throw Error('Ungültige Unteraufgaben.');
  const seen = new Set();
  return value.map(item => {
    const title = String(item?.title || '').trim();
    const id = typeof item?.id === 'string' && /^[\w-]{1,80}$/.test(item.id) ? item.id : randomUUID();
    if (!title || title.length > 500 || /[\r\n]/.test(title) || seen.has(id) || typeof item?.done !== 'boolean') throw Error('Ungültige Unteraufgaben.');
    seen.add(id);
    return {id, title, done: item.done};
  });
}
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
function readJson(file, fallback) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback; }
function moveLegacy(source, destination) { if (fs.existsSync(source) && !fs.existsSync(destination)) { fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.renameSync(source,destination); } }
class Store {
  constructor(dir) {
    this.dir = dir; this.file = path.join(dir,'todo.txt'); this.archiveFile = path.join(dir,'done.txt'); this.metadataDir = path.join(dir,'metadata'); this.metaFile = path.join(this.metadataDir,'.machen.json'); this.eventsFile = path.join(this.metadataDir,'events.json'); this.attachmentsDir = path.join(this.metadataDir,'attachments'); this.backupDir = path.join(dir,'backups');
    fs.mkdirSync(dir,{recursive:true});
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file,'','utf8');
    if (!fs.existsSync(this.archiveFile)) fs.writeFileSync(this.archiveFile,'','utf8');
    fs.mkdirSync(this.metadataDir,{recursive:true}); fs.mkdirSync(this.backupDir,{recursive:true});
    const legacyMetaFile = path.join(dir,'.machen.json');
    if (!fs.existsSync(this.metaFile) && fs.existsSync(legacyMetaFile)) {
      const legacy = readJson(legacyMetaFile,{}), events = Array.isArray(legacy.events) ? legacy.events : [];
      delete legacy.events; atomic(this.metaFile,JSON.stringify(legacy,null,2)); atomic(this.eventsFile,JSON.stringify({version:1,events},null,2)); fs.unlinkSync(legacyMetaFile);
    }
    if (fs.existsSync(this.metaFile) && fs.existsSync(this.eventsFile) && fs.existsSync(legacyMetaFile)) fs.unlinkSync(legacyMetaFile);
    moveLegacy(path.join(dir,'attachments'),this.attachmentsDir);
    moveLegacy(path.join(dir,'todo.txt.bak'),path.join(this.backupDir,'todo.txt.bak'));
    moveLegacy(path.join(dir,'done.txt.bak'),path.join(this.backupDir,'done.txt.bak'));
    fs.mkdirSync(this.attachmentsDir,{recursive:true});
    this.meta = readJson(this.metaFile,{version:1,context:{}});
    const eventData = readJson(this.eventsFile,{version:1,events:[]}); this.events = eventData.events;
    if (this.meta.version !== 1 || !this.meta.context || eventData.version !== 1 || !Array.isArray(this.events)) throw Error('Die Begleitdatei hat ein unbekanntes Format.');
    if (this.meta.pending !== undefined) {
      const pending=this.meta.pending;
      atomic(this.file,typeof pending==='string'?pending:pending.todo);
      if(typeof pending==='object')atomic(this.archiveFile,pending.done);
      if(typeof pending==='object'&&Array.isArray(pending.events))this.events=pending.events;
      atomic(this.eventsFile,JSON.stringify({version:1,events:this.events},null,2));
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
  snapshot() { this.refresh();const enrich=t=>({...t,...(this.meta.context[t.id]||{})});return {tasks:this.tasks.map(enrich),archived:this.archived.map(t=>({...enrich(t),archived:true})),events:this.events}; }
  commit() {
    if (fs.readFileSync(this.file,'utf8') !== this.raw || fs.readFileSync(this.archiveFile,'utf8')!==this.archiveRaw) { this.refresh(); throw Error('Die Datei wurde extern geändert. Bitte erneut versuchen.'); }
    const raw = this.tasks.map(serialize).join('\n') + (this.tasks.length?'\n':'');
    const archiveRaw=this.archived.map(serialize).join('\n')+(this.archived.length?'\n':'');
    fs.copyFileSync(this.file,path.join(this.backupDir,'todo.txt.bak'));
    fs.copyFileSync(this.archiveFile,path.join(this.backupDir,'done.txt.bak'));
    atomic(this.metaFile,JSON.stringify({...this.meta,pending:{todo:raw,done:archiveRaw,events:this.events}},null,2));
    atomic(this.file,raw); this.raw = raw;
    atomic(this.archiveFile,archiveRaw);this.archiveRaw=archiveRaw;
    atomic(this.eventsFile,JSON.stringify({version:1,events:this.events},null,2));
    atomic(this.metaFile,JSON.stringify(this.meta,null,2));
  }
  mutate(action, data) {
    this.refresh(); const before = JSON.stringify({tasks:this.tasks,archived:this.archived,meta:this.meta,events:this.events}); let deletedFiles=[];
    try {
      if(action==='archiveCompleted'){
        const done=this.tasks.filter(t=>t.done);this.archived.push(...done);this.tasks=this.tasks.filter(t=>!t.done);
        for(const t of done)this.events.push({id:randomUUID(),taskId:t.id,title:t.title,day:today(),at:new Date().toISOString(),type:'archive'});
        if(done.length)this.commit();return this.snapshot();
      }
      if(action==='reorder'){
        if(!Array.isArray(data.ids)||!data.ids.length||new Set(data.ids).size!==data.ids.length||data.ids.some(id=>typeof id!=='string'))throw Error('Ungültige Reihenfolge.');
        const requested=new Set(data.ids),positions=[];
        for(let i=0;i<this.tasks.length;i++)if(requested.has(this.tasks[i].id))positions.push(i);
        if(positions.length!==data.ids.length)throw Error('Ungültige Reihenfolge.');
        const tasksById=new Map(this.tasks.map(task=>[task.id,task]));
        positions.forEach((position,index)=>{this.tasks[position]=tasksById.get(data.ids[index]);});
        this.commit();return this.snapshot();
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
        if (data.dueTime !== undefined && data.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.dueTime)) throw Error('Ungültige Uhrzeit.');
        if(data.scheduled && (!datePattern.test(data.scheduled) || Number.isNaN(Date.parse(data.scheduled+'T12:00:00Z')) || new Date(data.scheduled+'T12:00:00Z').toISOString().slice(0,10)!==data.scheduled)) throw Error('Ungültiges Datum.');
        Object.assign(t,{title:data.title.trim(),priority:data.priority||'',due:data.due||''});
        if(data.scheduled !== undefined) t.scheduled=data.scheduled||'';
        const old = this.meta.context[t.id]||{};
        const dueTime = data.dueTime === undefined ? old.dueTime || '' : data.dueTime || '';
        this.meta.context[t.id] = {...old,notes:String(data.notes??old.notes??'').slice(0,100000),dueTime:data.due?dueTime:'',subtasks:normalizeSubtasks(data.subtasks,old.subtasks||[])};
      } else if (action === 'toggle') { t.done = !t.done; t.completed = t.done ? today() : '';if(t.done&&this.meta.context[t.id])this.meta.context[t.id].snoozedUntil='';if(!t.done&&this.archived.includes(t)){this.archived=this.archived.filter(x=>x.id!==t.id);this.tasks.push(t);} }
      else if (action === 'delete') {deletedFiles=this.meta.context[t.id]?.files||[];delete this.meta.context[t.id];this.tasks = this.tasks.filter(x=>x.id!==t.id);this.archived=this.archived.filter(x=>x.id!==t.id);}
      else if(action==='archive'){if(!t.done||!this.tasks.includes(t))throw Error('Nur erledigte Aufgaben lassen sich archivieren.');this.tasks=this.tasks.filter(x=>x.id!==t.id);this.archived.push(t);}
      else if(action==='restore'){if(!this.archived.includes(t))throw Error('Aufgabe ist nicht im Archiv.');this.archived=this.archived.filter(x=>x.id!==t.id);this.tasks.push(t);}
      else throw Error('Unbekannte Aktion.');
      this.events.push({id:randomUUID(),taskId:t.id,title:t.title,day:today(),at:new Date().toISOString(),type:action==='toggle'?(t.done?'completed':'reopened'):action});
      this.commit(); for(const file of deletedFiles)if(path.basename(file.stored)===file.stored)try{fs.unlinkSync(path.join(this.attachmentsDir,file.stored));}catch{} return this.snapshot();
    } catch(e) { const b=JSON.parse(before); this.tasks=b.tasks;this.archived=b.archived; this.meta=b.meta;this.events=b.events; this.raw=null;this.archiveRaw=null; throw e; }
  }
  attach(id, files) {
    this.refresh(); if (![...this.tasks,...this.archived].some(t=>t.id===id)) throw Error('Aufgabe nicht gefunden.');
    const dir=this.attachmentsDir; fs.mkdirSync(dir,{recursive:true});
    const context=this.meta.context[id] ||= {}; context.files ||= [];
    for (const file of files) { const name=path.basename(file); const stored=`${randomUUID()}${path.extname(name)}`; fs.copyFileSync(file,path.join(dir,stored)); context.files.push({id:randomUUID(),name,stored}); }
    this.commit(); return this.snapshot();
  }
  setSnooze(id, until) {
    this.refresh();
    if(!this.tasks.some(task=>task.id===id))throw Error('Aufgabe nicht mehr vorhanden.');
    if(until!==''&&(!isoPattern.test(until)||Number.isNaN(Date.parse(until))))throw Error('Ungültige Erinnerungszeit.');
    const context=this.meta.context[id] ||= {};
    context.snoozedUntil=until;
    this.commit();return this.snapshot();
  }
  clearSnoozes(ids) {
    this.refresh();
    let changed=false;
    for(const id of new Set(ids||[]))if(this.meta.context[id]?.snoozedUntil){this.meta.context[id].snoozedUntil='';changed=true;}
    if(changed)this.commit();
    return this.snapshot();
  }
  attachment(id,fileId) {
    const f=this.meta.context[id]?.files?.find(f=>f.id===fileId);
    if (!f || path.basename(f.stored)!==f.stored) throw Error('Datei nicht gefunden.');
    return path.join(this.attachmentsDir,f.stored);
  }
}
module.exports={Store,parse,serialize,today};
