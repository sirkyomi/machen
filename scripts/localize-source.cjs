// One-time migration of static UI strings. Never run on task data or twice on a source file.
const fs=require('node:fs'),parser=require('@babel/parser'),traverse=require('@babel/traverse').default,t=require('@babel/types'),generate=require('@babel/generator').default;
const {en}=require('../src/i18n.js');
const keys=Object.keys(en).sort((a,b)=>b.length-a.length);
const pattern=new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
function parts(text){const result=[];let end=0;for(const match of text.matchAll(pattern)){result.push(text.slice(end,match.index),t.callExpression(t.identifier('tr'),[t.stringLiteral(match[0])]));end=match.index+match[0].length;}result.push(text.slice(end));return result;}
function template(items){const quasis=[],expressions=[];let text='';for(const item of items){if(typeof item==='string')text+=item;else{quasis.push(t.templateElement({raw:text.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${'),cooked:text}));expressions.push(item);text='';}}quasis.push(t.templateElement({raw:text.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${'),cooked:text},true));return t.templateLiteral(quasis,expressions);}
for(const file of process.argv.slice(2)){
 const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'script'});
 traverse(ast,{
  StringLiteral(p){if(p.parentPath.isObjectProperty()&&p.key==='key')return;if(p.parentPath.isCallExpression()&&p.parent.callee.name==='tr')return;const value=p.node.value;if(en[value]){p.replaceWith(t.callExpression(t.identifier('tr'),[t.stringLiteral(value)]));p.skip();}else if(value.includes('<')&&parts(value).length>1){p.replaceWith(template(parts(value)));p.skip();}},
  TemplateLiteral:{exit(p){const items=[];let changed=false;p.node.quasis.forEach((q,i)=>{const chunks=parts(q.value.cooked??q.value.raw);if(chunks.length>1)changed=true;items.push(...chunks);if(i<p.node.expressions.length)items.push(p.node.expressions[i]);});if(changed){p.replaceWith(template(items));p.skip();}}}
 });fs.writeFileSync(file,generate(ast,{comments:true}).code+'\n');
}
