const {_electron:electron}=require('playwright');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
(async()=>{
const home=fs.mkdtempSync(path.join(os.tmpdir(),'machen-ui-'));fs.mkdirSync('test-results',{recursive:true});let app;
try{
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({shortcut:'Alt+Shift+F12'}));
 app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});
 const page=await app.firstWindow();await page.getByRole('button',{name:'Ablageort wählen'}).waitFor();await page.screenshot({path:'test-results/onboarding.png'});
 const dir=path.join(home,'data');fs.mkdirSync(dir);await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},dir);
 await page.getByRole('button',{name:'Ablageort wählen'}).click();await page.getByRole('heading',{name:'Heute',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Neue Aufgabe',exact:true}).fill('Angebot für Studio Nord +Arbeit');await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();
 await page.getByText('Angebot für Studio Nord',{exact:true}).click();await page.locator('#notes').fill('Rückmeldung aus der E-Mail vom Montag.');await page.getByRole('button',{name:'Speichern',exact:true}).click();await page.getByRole('button',{name:'Details schließen'}).click();
 await page.getByRole('button',{name:'Abschließen: Angebot für Studio Nord'}).click();await page.getByRole('button',{name:'Wieder öffnen: Angebot für Studio Nord'}).waitFor();
 await page.getByRole('button',{name:'Verlauf',exact:true}).click();await page.getByText('Abgeschlossen',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Heute',exact:false}).first().click();
 await page.evaluate(()=>window.api.call('quick'));
 const quick=app.windows().find(w=>w!==page);await quick.getByRole('textbox',{name:'Neue Aufgabe'}).fill('Zahnarzttermin vereinbaren');await quick.getByRole('button',{name:'Erfassen',exact:true}).click();
 await page.getByRole('button',{name:'Zahnarzttermin vereinbaren',exact:true}).waitFor();
 const shortcut=await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Alt+Shift+F12'));assert.equal(shortcut,true);
 await page.getByRole('button',{name:'Zahnarzttermin vereinbaren',exact:true}).click();
 await page.screenshot({path:'test-results/details.png'});
 await page.getByRole('button',{name:'Details schließen'}).click();
 await page.screenshot({path:'test-results/today.png'});
 const text=fs.readFileSync(path.join(dir,'todo.txt'),'utf8');assert.match(text,/Zahnarzttermin/);assert.match(text,/^x /m);
 await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
 await page.locator('#shortcut').fill('Alt+Shift+T');await page.getByRole('button',{name:'Einstellungen speichern'}).click();
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Alt+Shift+T')),true);
 const second=path.join(home,'second');fs.mkdirSync(second);await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},second);
 await page.getByRole('button',{name:'Ordner wechseln'}).click();await page.getByText(second,{exact:true}).waitFor();
 assert.equal(fs.readFileSync(path.join(dir,'todo.txt'),'utf8'),text);
 await app.close();app=await electron.launch({args:['.'],env:{...process.env,MACHEN_TEST_HOME:home}});
 const reopened=await app.firstWindow();await reopened.getByRole('heading',{name:'Heute',exact:true}).waitFor();
 assert.equal((await reopened.evaluate(()=>window.api.call('state'))).settings.directory,second);
 console.log('PASS onboarding, create, notes, complete, history, quick capture, shortcut registration/change, disk persistence, directory switch/restart');
}finally{if(app)await app.close();fs.rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
