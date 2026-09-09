const {_electron:electron}=require('playwright');

const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const assert=require('node:assert/strict');

(async()=>{

 const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-appearance-'));const dir=path.join(home,'data');fs.mkdirSync(dir);

 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({directory:dir,shortcut:'Alt+Shift+F11',theme:'light'}));

 fs.writeFileSync(path.join(dir,'todo.txt'),'2026-09-08 Angebot für Studio Nord +Arbeit id:one\n2026-09-09 Rückmeldung zum Entwurf einholen id:two\n');

 fs.mkdirSync('test-results',{recursive:true});let app;

 try{

  app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});const page=await app.firstWindow();

  await page.getByText('Angebot für Studio Nord',{exact:true}).click();

  for(const width of [1180,1920,2560]){

   await page.setViewportSize({width,height:1000});

   await page.waitForTimeout(100);

   const bounds=await page.evaluate(()=>({right:document.querySelector('.panel').getBoundingClientRect().right,width:innerWidth,scroll:document.documentElement.scrollWidth,content:document.querySelector('.workspace-content').getBoundingClientRect().width}));

   assert.equal(bounds.width,width);assert.ok(Math.abs(bounds.right-bounds.width)<2,JSON.stringify(bounds));assert.equal(bounds.scroll,bounds.width);assert.ok(bounds.content<=1241);

  }

  assert.ok(await page.locator('svg.lucide').count()>10);

  await page.screenshot({path:'test-results/fullscreen-light.png'});

  await page.locator('#notes').fill('Dieser Entwurf darf beim Themewechsel nicht verschwinden.');

  await page.getByRole('button',{name:'Dunkel',exact:true}).click();

  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');

  assert.equal(await page.locator('#notes').inputValue(),'Dieser Entwurf darf beim Themewechsel nicht verschwinden.');

  await page.screenshot({path:'test-results/fullscreen-dark.png'});

  await page.getByRole('button',{name:'Speichern',exact:true}).click();

  await page.evaluate(()=>window.api.call('quick'));const quick=app.windows().find(w=>w!==page);

  await quick.waitForFunction(()=>document.documentElement.dataset.theme==='dark');

  assert.equal(await quick.getByRole('button',{name:'Schließen',exact:true}).count(),0);

  assert.equal(await page.getByText('Schnell erfassen',{exact:true}).count(),0);

  assert.equal(await page.getByText('Lokal gespeichert. Ein Gedanke weniger im Kopf.',{exact:true}).count(),0);

  await quick.screenshot({path:'test-results/native-quick.png'});

  await quick.getByRole('textbox',{name:'Neue Aufgabe'}).fill('Ein ungespeicherter Gedanke');

  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('quick=1')).focus());

  await page.waitForTimeout(200);

  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).isVisible()),false);

  await page.evaluate(()=>window.api.call('quick'));

  assert.equal(await quick.getByRole('textbox',{name:'Neue Aufgabe'}).inputValue(),'Ein ungespeicherter Gedanke');

  await quick.keyboard.press('Escape');

  await page.waitForTimeout(100);

  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('quick=1')).isVisible()),false);

  await page.getByRole('button',{name:'Hell',exact:true}).click();

  await quick.waitForFunction(()=>document.documentElement.dataset.theme==='light');

  assert.equal(await quick.getByRole('textbox',{name:'Neue Aufgabe'}).inputValue(),'Ein ungespeicherter Gedanke');

  await page.getByRole('button',{name:'Dunkel',exact:true}).click();

  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');

  await app.close();app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});

  const restored=await app.firstWindow();await restored.waitForFunction(()=>document.documentElement.dataset.theme==='dark');

  assert.equal((await restored.evaluate(()=>window.api.call('state'))).settings.theme,'dark');

  await restored.setViewportSize({width:1450,height:960});

  await restored.locator('.task-body').first().hover();

  const hover=await restored.locator('.task-body').first().evaluate(el=>({inner:getComputedStyle(el).backgroundColor,outer:getComputedStyle(el.parentElement).backgroundColor}));

  assert.equal(hover.inner,'rgba(0, 0, 0, 0)');assert.notEqual(hover.outer,'rgba(0, 0, 0, 0)');

  await restored.locator('#composer input[name=title]').focus();

  assert.equal(await restored.locator('#composer input[name=title]').evaluate(el=>getComputedStyle(el).outlineStyle),'none');

  assert.notEqual(await restored.locator('#composer').evaluate(el=>getComputedStyle(el).boxShadow),'none');

  await restored.screenshot({path:'test-results/daily-refined-dark.png'});

  console.log('PASS full-width layout at 1180/1920/2560, Lucide, light/dark, draft preservation, quick-window sync, theme persistence');

 }finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}

})().catch(e=>{console.error(e);process.exitCode=1;});
