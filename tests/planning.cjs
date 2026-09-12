const {_electron:electron}=require('playwright');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-planning-')),dir=path.join(home,'data');fs.mkdirSync(dir);fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,language:'en',shortcut:'Alt+Shift+F5'}));let app;
 try{
  app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});await app.firstWindow();let page;
  for(let i=0;i<100&&!page;i++){page=app.windows().find(w=>w.url().includes('index.html')&&!w.url().includes('quick=1'));if(!page)await new Promise(r=>setTimeout(r,50));}
  await page.locator('#composer').waitFor();
  const dates=await page.evaluate(()=>{const next=new Date();next.setDate(next.getDate()+1);return {today:localDay(),tomorrow:localDay(next)};});
  const calendarWidth=await page.locator('.week').evaluate(el=>el.getBoundingClientRect().width);
  if(!await page.locator(`[data-day="${dates.tomorrow}"]`).count())await page.locator('[data-step="7"]').click();await page.locator(`[data-day="${dates.tomorrow}"]`).click();
  assert.ok(Math.abs((await page.locator('.week').evaluate(el=>el.getBoundingClientRect().width))-calendarWidth)<=4);
  assert.match(await page.locator('.day-heading h1').textContent(),/^[A-Za-z]+, /);assert.equal(await page.locator('.day-heading h1').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  assert.equal(await page.locator('.workspace-content').evaluate(el=>{const container=el.getBoundingClientRect(),navigation=el.querySelector('.week-navigation').getBoundingClientRect();return navigation.right<=container.right+1;}),true);
  await page.getByRole('textbox',{name:'New task',exact:true}).fill('Only tomorrow');await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.locator('.task-title').filter({hasText:'Only tomorrow'}).waitFor();
  assert.equal(await page.locator('.week-navigation').getByRole('button',{name:'Today',exact:true}).count(),1);await page.locator('.week-navigation').getByRole('button',{name:'Today',exact:true}).click();assert.equal(await page.locator('.task-title').filter({hasText:'Only tomorrow'}).count(),0);
  assert.equal(await page.locator('.nav .count').textContent(),'0');
  if(!await page.locator(`[data-day="${dates.tomorrow}"]`).count())await page.locator('[data-step="7"]').click();await page.locator(`[data-day="${dates.tomorrow}"]`).click();await page.locator('.task-title').filter({hasText:'Only tomorrow'}).waitFor();
  const task=(await page.evaluate(()=>window.api.call('state'))).tasks[0];assert.equal(task.created,dates.today);assert.equal(task.scheduled,dates.tomorrow);
  await page.evaluate(()=>window.api.call('quick'));const quick=app.windows().find(w=>w.url().includes('quick=1'));
  await quick.locator('.quick').waitFor();
  const edge=await quick.locator('#quick-form').evaluate(el=>{const box=el.getBoundingClientRect();return {left:box.left,top:box.top,right:box.right,width:innerWidth};});
  assert.equal(edge.left,0);assert.equal(edge.top,0);assert.equal(edge.right,edge.width);
  assert.equal(await quick.locator('.quick .composer-line').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  assert.equal(await quick.locator('#quick-form').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  assert.equal(await quick.locator('.quick').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).getBounds().height),56);
  assert.equal(await quick.locator('.quick').evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');
  fs.mkdirSync('test-results',{recursive:true});await quick.screenshot({path:'test-results/rounded-quick.png',omitBackground:true});
  console.log('PASS tomorrow planning, today exclusion/count, actual creation date and rounded transparent popup');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
