const {_electron:electron}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-productivity-')),dir=path.join(home,'data');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,language:'en',theme:'dark',shortcut:'Alt+Shift+F6'}));
 fs.writeFileSync(path.join(dir,'todo.txt'),'(B) 2026-09-11 First task id:first\n(A) 2026-09-11 Priority task id:priority\n(B) 2026-09-11 Last task due:2026-09-12 id:last\n');
 let app;
 try{
  app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});await app.firstWindow();let page;for(let i=0;i<100&&!page;i++){page=app.windows().find(w=>w.url().includes('index.html')&&!w.url().includes('quick=1')&&!w.url().includes('pinned=1'));if(!page)await new Promise(resolve=>setTimeout(resolve,50));}
  await page.getByRole('button',{name:'All tasks',exact:true}).click();
  assert.equal(await page.locator('.group .task-title').first().textContent(),'Priority task');
  assert.equal(await page.locator('.priority-group').count(),2);
  await page.getByRole('heading',{name:'Priority A',exact:true}).waitFor();
  assert.equal(await page.locator('.priority-group .group-header').first().evaluate(el=>getComputedStyle(el).justifyContent),'space-between');
  assert.equal(await page.locator('.priority-group').nth(1).evaluate(el=>getComputedStyle(el).borderTopWidth),'1px');
  assert.equal(await page.locator('.priority-group .priority[data-priority=A]').count(),1);
  assert.equal(await page.locator('.priority-group .priority[data-priority=B]').count(),1);
  assert.equal(await page.locator('.task .priority').count(),0);
  assert.deepEqual(await page.locator('.priority-group').filter({has:page.getByRole('heading',{name:'Priority B',exact:true})}).locator('.task-title').allTextContents(),['Last task','First task']);
  assert.equal(await page.getByRole('combobox',{name:'Sort tasks'}).count(),0);
  assert.equal(await page.locator('[data-drag-task]').count(),0);
  await page.getByText('First task',{exact:true}).click();
  const taskDialog=page.getByRole('dialog',{name:'Task details'});assert.equal(await taskDialog.getAttribute('open'),'');await page.mouse.click(5,5);await taskDialog.waitFor({state:'detached'});await page.getByText('First task',{exact:true}).click();await taskDialog.getByRole('combobox',{name:'Priority',exact:true}).click();await taskDialog.getByRole('option',{name:'A',exact:true}).click();assert.equal(await page.locator('#priority').inputValue(),'A');
  const entry=page.getByRole('textbox',{name:'New subtask'});await entry.fill('Review copy');await entry.press('Enter');await entry.fill('Send build');await page.getByRole('button',{name:'Add',exact:true}).last().click();
  await page.getByRole('checkbox',{name:'Complete subtask'}).first().check();await page.getByRole('button',{name:'Save',exact:true}).click();await taskDialog.waitFor({state:'detached'});
  let task=(await page.evaluate(()=>window.api.call('state'))).tasks.find(item=>item.id==='first');assert.deepEqual(task.subtasks.map(item=>[item.title,item.done]),[['Review copy',true],['Send build',false]]);
  await page.evaluate(()=>window.api.call('reminderSettings',{enabled:true,time:'09:00',leadMinutes:60}));
  await page.evaluate(()=>window.api.call('snooze',{id:'first',preset:'10m'}));
  task=(await page.evaluate(()=>window.api.call('state'))).tasks.find(item=>item.id==='first');assert.ok(Date.parse(task.snoozedUntil)>Date.now());
  assert.match(await page.locator('.workspace .task-meta').filter({hasText:'2 subtasks'}).textContent(),/1\/2 subtasks/);
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/productivity-features.png'});
  console.log('PASS automatic priority/due sorting, priority groups, modal task details, reminder snooze and subtasks');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
