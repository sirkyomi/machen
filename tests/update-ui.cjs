const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-update-ui-')),dir=path.join(home,'data');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,language:'en',theme:'dark',shortcut:'Alt+Shift+F6'}));let app;
 try{
  app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});await app.firstWindow();let page;
  for(let i=0;i<100&&!page;i++){page=app.windows().find(w=>w.url().includes('index.html')&&!w.url().includes('quick=1'));if(!page)await new Promise(r=>setTimeout(r,50));}
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('[data-settings-tab="app"]').click();
  await page.getByText('Updates are unavailable in this build. Please use the installer.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Check for updates',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('[data-settings-update-dot]').isVisible(),false);assert.equal(await page.locator('[data-updates-tab-dot]').isVisible(),false);
  await page.getByRole('button',{name:'Change shortcut',exact:true}).click();await page.keyboard.press('Control+Alt+K');await page.waitForFunction(()=>window.api.call('state').then(s=>s.settings.shortcut==='CommandOrControl+Alt+K'));
  // Exercise renderer states without a network request or installing an update.
  await page.evaluate(()=>{updateState={version:'0.2.3',target:'0.3.0',status:'ready',progress:100};paintUpdates();});
  assert.equal(await page.locator('[data-settings-update-dot]').isVisible(),true);assert.equal(await page.locator('[data-updates-tab-dot]').isVisible(),true);
  await page.evaluate(()=>{updateState={version:'0.3.0',target:'0.3.0',status:'ready',progress:100};paintUpdates();});
  assert.equal(await page.locator('[data-settings-update-dot]').isVisible(),false);assert.equal(await page.locator('[data-updates-tab-dot]').isVisible(),false);
  await page.evaluate(()=>{updateState={version:'0.2.3',target:'0.3.0',status:'ready',progress:100};paintUpdates();});
  assert.equal(await page.locator('#shortcut').inputValue(),'CommandOrControl+Alt+K');
  await page.getByRole('button',{name:'Restart now',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('#shortcut').inputValue(),'CommandOrControl+Alt+K');
  assert.equal((await page.evaluate(()=>window.api.call('update:state'))).status,'unavailable');
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/update-settings.png'});
  await page.evaluate(()=>window.api.call('quick'));const quick=app.windows().find(w=>w.url().includes('quick=1'));
  assert.equal(await quick.evaluate(async()=>{try{await window.api.call('update:install');return false;}catch{return true;}}),true);
  console.log('PASS update settings, disabled development updates, draft preservation, restart cancellation and quick-window IPC restriction');
 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
