let controlPopover=null,controlOwner=null,controlSource=null;
let controlCounter=0;
function closeControl(restoreFocus=false){
 if(controlPopover)controlPopover.remove();controlPopover=null;
 controlOwner?.setAttribute('aria-expanded','false');if(restoreFocus&&controlOwner?.isConnected)controlOwner.focus();
 controlOwner=null;controlSource=null;
}
function controlLabel(source){return source.getAttribute('aria-label')||source.labels?.[0]?.textContent.trim()||'';}
function dateValue(value){return value?new Date(value+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'}):tr('Datum wählen');}
function syncControl(source){
 const button=source.nextElementSibling;if(!button?.classList.contains('custom-control'))return;
 const value=source.tagName==='SELECT'?source.selectedOptions[0]?.textContent||'':dateValue(source.value);
 button.querySelector('.control-value').textContent=value;button.disabled=source.disabled;
 button.setAttribute('aria-label',controlLabel(source));button.dataset.empty=String(!source.value);
}
function enhanceControls(){
 document.querySelectorAll('select,input[type=date]').forEach(source=>{
  if(source.dataset.enhanced){syncControl(source);return;}
  source.dataset.enhanced='true';source.classList.add('control-source');source.tabIndex=-1;source.setAttribute('aria-hidden','true');
  const wrapper=document.createElement('span');wrapper.className='control-wrapper';source.before(wrapper);wrapper.append(source);
  const button=document.createElement('button');button.type='button';button.className='custom-control';
  button.setAttribute('role','combobox');button.setAttribute('aria-haspopup',source.tagName==='SELECT'?'listbox':'dialog');button.setAttribute('aria-expanded','false');
  button.innerHTML=`<span class="control-value"></span>${icon(source.tagName==='SELECT'?'down':'today')}`;wrapper.append(button);syncControl(source);
  button.addEventListener('click',()=>openControl(source,button));
  button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openControl(source,button);}});
  source.addEventListener('change',()=>syncControl(source));
 });
}
function positionControl(){
 if(!controlPopover||!controlOwner)return;const anchor=controlOwner.getBoundingClientRect();
 const box=controlPopover.getBoundingClientRect(),margin=10;
 const x=Math.max(margin,Math.min(anchor.left,innerWidth-box.width-margin));
 const y=anchor.bottom+box.height+margin<=innerHeight?anchor.bottom+6:Math.max(margin,anchor.top-box.height-6);
 controlPopover.style.left=x+'px';controlPopover.style.top=y+'px';
}
function commitControl(value){const source=controlSource,owner=controlOwner;closeControl();source.value=value;syncControl(source);owner?.focus();source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}));}
function openControl(source,button){
 if(controlOwner===button){closeControl(true);return;}
 closeControl();controlSource=source;controlOwner=button;
 const pop=document.createElement('div');pop.className='control-popover';pop.id='control-popover-'+(++controlCounter);
 button.setAttribute('aria-controls',pop.id);button.setAttribute('aria-expanded','true');document.body.append(pop);controlPopover=pop;
 if(source.tagName==='SELECT'){
  pop.setAttribute('role','listbox');pop.setAttribute('aria-label',controlLabel(source));
  for(const option of source.options){const item=document.createElement('button');item.type='button';item.className='menu-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.disabled=option.disabled;item.textContent=option.textContent;item.addEventListener('click',()=>commitControl(option.value));pop.append(item);}
  pop.style.minWidth=Math.min(button.offsetWidth,innerWidth-20)+'px';positionControl();pop.querySelector('[aria-selected=true]')?.focus();
  pop.addEventListener('keydown',e=>{const options=[...pop.querySelectorAll('button:not(:disabled)')];let i=options.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();i=e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[i]?.focus();}else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){options.find(o=>o.textContent.toLowerCase().startsWith(e.key.toLowerCase()))?.focus();}});
 }else{
  pop.classList.add('calendar-popover');pop.setAttribute('role','dialog');pop.setAttribute('aria-label',tr('Datum wählen'));
  let cursor=source.value?new Date(source.value+'T12:00:00'):new Date();cursor.setDate(1);
  function draw(focusDate){
   const year=cursor.getFullYear(),month=cursor.getMonth(),first=new Date(year,month,1,12);const start=new Date(first);start.setDate(1-(first.getDay()+6)%7);
   pop.innerHTML=`<div class="calendar-header"><button type="button" data-month="-1" aria-label="${tr('Vorheriger Monat')}">${icon('left')}</button><strong>${first.toLocaleDateString(locale(),{month:'long',year:'numeric'})}</strong><button type="button" data-month="1" aria-label="${tr('Nächster Monat')}">${icon('right')}</button></div><div class="calendar-weekdays">${Array.from({length:7},(_,i)=>{const d=new Date(2026,5,1+i);return '<span>'+d.toLocaleDateString(locale(),{weekday:'narrow'})+'</span>';}).join('')}</div><div class="calendar-grid"></div><div class="calendar-footer"><button type="button" data-date-today>${tr('Heute')}</button>${source.id==='jump-date'?'':`<button type="button" data-date-clear>${tr('Ohne Termin')}</button>`}</div>`;
   const grid=pop.querySelector('.calendar-grid');
   for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const value=localDay(d),cell=document.createElement('button');cell.type='button';cell.textContent=String(d.getDate());cell.dataset.date=value;cell.className='calendar-day';cell.dataset.outside=String(d.getMonth()!==month);cell.setAttribute('aria-label',dateLabel(value));cell.setAttribute('aria-pressed',String(source.value===value));if(value===localDay())cell.setAttribute('aria-current','date');cell.addEventListener('click',()=>commitControl(value));grid.append(cell);}
   pop.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{cursor.setMonth(cursor.getMonth()+Number(b.dataset.month));draw();pop.querySelector(`[data-month="${b.dataset.month}"]`)?.focus();}));
   pop.querySelector('[data-date-today]').addEventListener('click',()=>commitControl(localDay()));pop.querySelector('[data-date-clear]')?.addEventListener('click',()=>commitControl(''));
   positionControl();if(focusDate)pop.querySelector(`[data-date="${focusDate}"]`)?.focus();
  }
  draw(source.value||localDay());
  pop.addEventListener('keydown',e=>{if(!e.target.dataset.date)return;const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(offsets[e.key]){e.preventDefault();const d=new Date(e.target.dataset.date+'T12:00:00');d.setDate(d.getDate()+offsets[e.key]);cursor=new Date(d.getFullYear(),d.getMonth(),1);draw(localDay(d));}});
 }
}
document.addEventListener('pointerdown',e=>{if(controlPopover&&!controlPopover.contains(e.target)&&!controlOwner?.contains(e.target))closeControl();},true);
document.addEventListener('keydown',e=>{if(!controlPopover)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeControl(true);}else if(e.key==='Tab')closeControl();},true);
window.addEventListener('resize',positionControl);
window.addEventListener('blur',()=>closeControl());
document.addEventListener('scroll',e=>{if(controlPopover&&!controlPopover.contains(e.target))closeControl();},true);
