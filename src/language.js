function tr(key,values){return window.MachenI18n.translate(state?.settings.language||'de',key,values);}
function locale(){return state?.settings.language==='en'?'en-GB':'de-DE';}
function languagePicker(){return `<label class="language-picker"><span>${tr('Sprache')}</span><select data-language aria-label="Sprache / Language"><option value="de" ${state?.settings.language!=='en'?'selected':''}>Deutsch</option><option value="en" ${state?.settings.language==='en'?'selected':''}>English</option></select></label>`;}
function renderPreservingInputs(){
 const saved=[...document.querySelectorAll('#detail-form,#quick-form,#settings-form')].map(form=>({id:form.id,values:Object.fromEntries(new FormData(form))}));
 const active=document.activeElement,activeId=active?.id,activeName=active?.name,formId=active?.form?.id;
 const scroll=window.scrollY,panelScroll=document.querySelector('.panel')?.scrollTop;
 render();
 for(const item of saved){const form=document.getElementById(item.id);if(!form)continue;for(const [name,value] of Object.entries(item.values)){const field=form.elements.namedItem(name);if(field){if(field.type==='checkbox')field.checked=value==='on';else field.value=value;}}
  for(const picker of form.querySelectorAll('.project-picker'))setPickedProjects(picker,JSON.parse(item.values[picker.dataset.kind]||'[]'));
 }
 if(activeId)document.getElementById(activeId)?.focus();else if(formId&&activeName)document.getElementById(formId)?.elements.namedItem(activeName)?.focus();
 enhanceControls();
 window.scrollTo(0,scroll);if(panelScroll!==undefined&&document.querySelector('.panel'))document.querySelector('.panel').scrollTop=panelScroll;
}
document.addEventListener('change',async e=>{if(!e.target.hasAttribute('data-language'))return;try{await call('language',{language:e.target.value});await refresh();}catch(err){toast(err.message);}});
