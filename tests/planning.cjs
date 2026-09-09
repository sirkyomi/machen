const {_electron:electron}=require('playwright');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-planning-')),dir=path.join(home,'data');fs.mkdirSync(dir);fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,language:'en',shortcut:'Alt+Shift+F5'}));let app;
 try{
  app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});await app.firstWindow();let page;
  for(let i=0;i<100&&!page;i++){page=app.windows().find(w=>w.url().includes('index.html')&&!w.url().includes('quick=1'));if(!page)await new Promise(r=>setTimeout(r,50));}
  await page.locator('#composer').waitFor();
  const dates=await page.evaluate(()=>{const next=new Date();next.setDate(next.getDate()+1);return {today:localDay(),tomorrow:localDay(next)};});
  await page.locator('#jump-date').fill(dates.tomorrow);await page.locator('#jump-date').dispatchEvent('change');
  await page.getByRole('textbox',{name:'New task',exact:true}).fill('Only tomorrow');await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.locator('.task-title').filter({hasText:'Only tomorrow'}).waitFor();
  await page.getByRole('button',{name:'Today',exact:true}).click();assert.equal(await page.locator('.task-title').filter({hasText:'Only tomorrow'}).count(),0);
  assert.equal(await page.locator('.nav .count').textContent(),'0');
  await page.locator('#jump-date').fill(dates.tomorrow);await page.locator('#jump-date').dispatchEvent('change');await page.locator('.task-title').filter({hasText:'Only tomorrow'}).waitFor();
  const task=(await page.evaluate(()=>window.api.call('state'))).tasks[0];assert.equal(task.created,dates.today);assert.equal(task.scheduled,dates.tomorrow);
  await page.evaluate(()=>window.api.call('quick'));const quick=app.windows().find(w=>w.url().includes('quick=1'));
  await quick.locator('.quick').waitFor();assert.equal(await quick.locator('.quick').evaluate(el=>getComputedStyle(el).borderRadius),'14px');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).getBounds().height),92);
  assert.equal(await quick.locator('.quick').evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');
  fs.mkdirSync('test-results',{recursive:true});await quick.screenshot({path:'test-results/rounded-quick.png',omitBackground:true});
  console.log('PASS tomorrow planning, today exclusion/count, actual creation date and rounded transparent popup');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
