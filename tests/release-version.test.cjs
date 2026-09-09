const {test}=require('node:test');const assert=require('node:assert/strict');
const {nextVersion}=require('../scripts/release-version.cjs');
test('first release increments the source baseline',()=>assert.equal(nextVersion('0.2.5',[]),'0.2.6'));
test('release numbering compares numeric versions and ignores unrelated tags',()=>assert.equal(nextVersion('0.2.5',['v0.2.9','v0.2.10','v0.2.11-beta.1','other','v0.1.99']),'0.2.11'));
test('higher baseline permits a new minor series and existing major tags remain monotonic',()=>{
 assert.equal(nextVersion('0.3.0',['v0.2.19']),'0.3.1');assert.equal(nextVersion('0.2.5',['v1.0.0']),'1.0.1');
 assert.throws(()=>nextVersion('bad',[]));
});
