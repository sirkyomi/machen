const {test}=require('node:test');const assert=require('node:assert/strict');
const {Updates,REPOSITORY}=require('../electron/updates.cjs');
const offer={TargetFullRelease:{Version:'0.3.0',FileName:'update.nupkg'}};
function setup(overrides={}){
  const calls=[];const manager={getCurrentVersion:()=> '0.2.3',getUpdatePendingRestart:()=>null,checkForUpdatesAsync:async()=>offer,downloadUpdateAsync:async(o,progress)=>{assert.equal(o,offer);progress(40);},waitExitThenApplyUpdate:(...args)=>calls.push(args),...overrides};
  const updates=new Updates({version:'0.2.3',createManager:()=>manager,quit:()=>calls.push('quit')});return {updates,calls};
}
test('fixed public source; check, download and explicit apply use trusted manager assets',async()=>{
  assert.equal(REPOSITORY,'https://github.com/sirkyomi/machen');const {updates,calls}=setup();
  updates.install();assert.equal(calls.length,0);await updates.check();assert.equal(updates.snapshot().status,'available');
  await updates.download();assert.equal(updates.snapshot().status,'ready');assert.equal(calls.length,0);
  updates.install();assert.deepEqual(calls,[[offer.TargetFullRelease,false,true],'quit']);
});
test('pending updates survive restart and prevent accidental re-checks',async()=>{
  const {updates}=setup({getUpdatePendingRestart:()=>offer.TargetFullRelease,checkForUpdatesAsync:()=>{throw Error('should not run');}});
  await updates.check();assert.equal(updates.snapshot().status,'ready');
});
test('network and download errors permit retry; no update is distinct from failure',async()=>{
  let checks=0,downloads=0;const {updates}=setup({checkForUpdatesAsync:async()=>{if(!checks++)throw Error('offline');return offer;},downloadUpdateAsync:async()=>{if(!downloads++)throw Error('offline');}});
  await updates.check();assert.equal(updates.snapshot().status,'check-error');await updates.check();await updates.download();assert.equal(updates.snapshot().status,'download-error');await updates.download();assert.equal(updates.snapshot().status,'ready');
  const empty=setup({checkForUpdatesAsync:async()=>null}).updates;await empty.check();assert.equal(empty.snapshot().status,'current');
});
test('unavailable builds and overlapping checks cannot trigger downloads or installs',async()=>{
  const absent=new Updates({version:'dev',createManager:()=>{throw Error('not installed');}});await absent.check();await absent.download();assert.equal(absent.install().status,'unavailable');
  let resolve,count=0;const {updates}=setup({checkForUpdatesAsync:()=>{count++;return new Promise(r=>resolve=r);}});const first=updates.check();await updates.check();assert.equal(count,1);resolve(offer);await first;
});
