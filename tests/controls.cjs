const {_electron:electron}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-controls-')),dir=path.join(home,'data');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,language:'en',theme:'dark',shortcut:'Alt+Shift+F7'}));
 fs.writeFileSync(path.join(dir,'todo.txt'),'2026-09-09 Existing +Work @Office id:existing\n');
 let app;
 try{
  app=await electron.launch({...(process.env.MACHEN_EXECUTABLE?{executablePath:process.env.MACHEN_EXECUTABLE,args:[]}:{args:['.']}),env:{...process.env,MACHEN_TEST_HOME:home}});
  await app.firstWindow();let page;for(let i=0;i<100&&!page;i++){page=app.windows().find(w=>w.url().includes('index.html')&&!w.url().includes('quick=1'));if(!page)await new Promise(r=>setTimeout(r,50));}
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const language=page.locator('.settings').getByRole('combobox',{name:'Sprache / Language',exact:true});
  await language.click();await page.getByRole('option',{name:'Deutsch',exact:true}).click();
  await page.getByRole('heading',{name:'Einstellungen',exact:true}).waitFor();
  await page.locator('.settings').getByRole('combobox',{name:'Sprache / Language',exact:true}).click();await page.getByRole('option',{name:'English',exact:true}).click();
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/modern-settings.png'});
  await page.evaluate(()=>window.api.call('quick'));const quick=app.windows().find(w=>w.url().includes('quick=1'));
  const bounds=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).getBounds());
  const small=await bounds();assert.equal(small.height,56);await quick.getByRole('textbox',{name:'New task',exact:true}).fill('Capture with details');
  await quick.getByRole('button',{name:'Expand task details'}).click();assert.ok((await bounds()).height>small.height+200);assert.ok((await bounds()).height<510);
  await quick.locator('#create-entry').focus();
  const projectEntryStyle=await quick.locator('#create-entry').locator('..').evaluate(el=>({border:getComputedStyle(el).borderColor,shadow:getComputedStyle(el).boxShadow,buttonWidth:el.querySelector('button').getBoundingClientRect().width,inputOutline:getComputedStyle(el.querySelector('input')).outlineStyle}));
  assert.notEqual(projectEntryStyle.shadow,'none');assert.equal(projectEntryStyle.buttonWidth,42);assert.equal(projectEntryStyle.inputOutline,'none');
  assert.equal(await quick.locator('#quick-form').evaluate(el=>getComputedStyle(el).boxShadow),'none');
  await quick.locator('#create-entry').fill('Wor');await quick.getByRole('option',{name:'Work',exact:true}).click();
  assert.ok((await bounds()).height>=await quick.locator('.quick').evaluate(el=>el.scrollHeight));
  await quick.locator('#create-context-entry').fill('NewContext');await quick.locator('#create-context-entry').press('Enter');
  await quick.getByRole('combobox',{name:'Priority',exact:true}).click();await quick.getByRole('option',{name:'B',exact:true}).click();
  await quick.getByRole('combobox',{name:'Due date',exact:true}).click();await quick.getByRole('button',{name:'Next month'}).click();
  const date=await quick.locator('.calendar-day[data-outside=false]').nth(14).getAttribute('data-date');
  await quick.locator('.calendar-day[data-outside=false]').nth(14).click();
  await quick.getByRole('combobox',{name:'Due date',exact:true}).click();await quick.keyboard.press('Escape');
  assert.equal(await quick.getByRole('dialog').count(),0);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).isVisible()),true);
  await quick.locator('#create-notes').fill('Extra context');await quick.screenshot({path:'test-results/modern-quick-expanded.png'});
  await quick.getByRole('combobox',{name:'Due date',exact:true}).click();await quick.screenshot({path:'test-results/modern-calendar.png'});await quick.keyboard.press('Escape');
  await quick.getByRole('button',{name:'Expand task details'}).click();for(let i=0;i<100&&(await bounds()).height!==small.height;i++)await new Promise(r=>setTimeout(r,30));assert.equal((await bounds()).height,small.height);
  await quick.getByRole('button',{name:'Expand task details'}).click();assert.equal(await quick.locator('#create-notes').inputValue(),'Extra context');
  await quick.getByRole('button',{name:'Capture',exact:true}).click();
  for(let i=0;i<100;i++){if(await app.evaluate(({BrowserWindow})=>!BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).isVisible()))break;await new Promise(r=>setTimeout(r,30));}
  const task=(await page.evaluate(()=>window.api.call('state'))).tasks.find(t=>t.title.startsWith('Capture with details'));
  assert.ok(task);assert.match(task.title,/\+Work @NewContext/);assert.equal(task.priority,'B');assert.equal(task.due,date);assert.equal(task.notes,'Extra context');
  await page.evaluate(()=>window.api.call('quick'));for(let i=0;i<100&&(await bounds()).height!==small.height;i++)await new Promise(r=>setTimeout(r,30));assert.equal((await bounds()).height,small.height);assert.equal(await quick.locator('input[name=title]').inputValue(),'');
  console.log('PASS custom language/priority/calendar controls, calendar Escape, quick resize/collapse, draft and metadata persistence');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
