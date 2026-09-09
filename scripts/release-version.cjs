const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const stable=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function compare(a,b){for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;}
function nextVersion(base,tags){
  if(!stable.test(base))throw Error('Base version must be a stable x.y.z version');
  let max=base.split('.').map(Number);
  for(const tag of tags){if(!stable.test(tag))continue;const parts=tag.replace(/^v/,'').split('.').map(Number);if(compare(parts,max)>0)max=parts;}
  max[2]++;return max.join('.');
}
if(require.main===module){
  const tags=execFileSync('git',['tag','--list','v*'],{encoding:'utf8'}).trim().split(/\s+/);
  const version=nextVersion(require('../package.json').version,tags);
  if(!process.env.GITHUB_OUTPUT)throw Error('GITHUB_OUTPUT must be set');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`version=${version}\ntag=v${version}\n`);
  console.log(`Release version: ${version}`);
}
module.exports={nextVersion};
