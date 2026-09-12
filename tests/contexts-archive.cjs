const {_electron:electron}=require('playwright');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-archive-')),dir=path.join(home,'data');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,theme:'dark',shortcut:'Alt+Shift+F9'}));
 fs.writeFileSync(path.join(dir,'todo.txt'),'(A) 2026-09-08 Alt +Arbeit @Telefon due:2020-01-01 id:old\n2026-09-08 Privat +Privat @Zuhause id:private\n');
 let app;try{
 app=await electron.launch({...(process.env.MACHEN_EXECUTABLE?{executablePath:process.env.MACHEN_EXECUTABLE,args:[]}:{args:['.']}),env:{...process.env,MACHEN_TEST_HOME:home}});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Aufgabendetails ausklappen'}).click();
 await page.getByRole('textbox',{name:'Neue Aufgabe',exact:true}).fill('Anruf vorbereiten');
 await page.locator('#create-context-entry').fill('Tel');await page.locator('#create-context-options').getByRole('option',{name:'@Telefon',exact:true}).click();
 await page.locator('#create-context-entry').fill('Büro');await page.locator('#create-context-entry').press('Enter');
 await page.locator('#create-entry').fill('Arbeit');await page.locator('#create-entry').press('Enter');
 await page.locator('#create-priority').selectOption('A');await page.locator('#create-notes').fill('Notiz bleibt im Archiv');
 await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();
 await page.getByRole('button',{name:'Alle Aufgaben',exact:true}).click();
 const newTask=(await page.evaluate(()=>window.api.call('state'))).tasks.find(t=>t.title.startsWith('Anruf vorbereiten'));
 assert.match(newTask.title,/@Telefon/);assert.match(newTask.title,/@B%C3%BCro/);
 await page.getByRole('button',{name:'Filter',exact:true}).click();
 await page.locator('select[aria-label="Nach Projekt filtern"]').selectOption('Arbeit');await page.locator('select[aria-label="Nach Priorität filtern"]').selectOption('A');await page.locator('select[aria-label="Nach Kontext filtern"]').selectOption('Telefon');await page.locator('select[aria-label="Nach Fälligkeit filtern"]').selectOption('overdue');
 assert.equal(await page.locator('.task-title').count(),1);assert.equal(await page.locator('.task-title').textContent(),'Alt');
 await page.getByRole('button',{name:'Zurücksetzen',exact:true}).click();assert.equal(await page.locator('.task-title').count(),3);
 await page.getByRole('button',{name:'Abschließen: Anruf vorbereiten',exact:true}).click();
 await page.getByRole('button',{name:'Alle erledigten archivieren',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Archivieren',exact:true}).click();
 await page.getByRole('button',{name:'Archiv',exact:true}).click();await page.locator('.task-title').filter({hasText:'Anruf vorbereiten'}).click();
 assert.equal(await page.locator('#notes').inputValue(),'Notiz bleibt im Archiv');
 assert.equal(await page.locator('#detail-form .chosen-projects .context-chip').count(),2);
 await page.getByRole('button',{name:'In Aufgaben zurückholen',exact:true}).click();assert.equal(await page.locator('.task-title').count(),0);
 await page.getByRole('button',{name:'Alle Aufgaben',exact:true}).click();await page.getByRole('button',{name:'Wieder öffnen: Anruf vorbereiten',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.api.call('state'))).tasks.find(t=>t.id===newTask.id).done,false);
 assert.equal(fs.readFileSync(path.join(dir,'done.txt'),'utf8'),'');
 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/contexts-filters.png'});assert.equal(errors.length,0,errors.join('\n'));console.log('PASS context select/create, combined filters/reset, archive, metadata, restore/reopen');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
