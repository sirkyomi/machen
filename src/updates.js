let updateState = null;
function updateControls() {
  const u=updateState;if(!u)return '';
  const messages={unavailable:'Updates sind in diesem Build nicht verfügbar. Bitte den Installer verwenden.',idle:'Beim Start und danach alle vier Stunden wird nach Updates gesucht.',checking:'Updates werden gesucht …',current:'Machen ist aktuell.',available:'Eine neue Version ist verfügbar.',downloading:'Update wird heruntergeladen …',ready:'Das Update ist bereit. Du kannst jetzt neu starten.',installing:'Update wird installiert …','check-error':'Updates konnten nicht geprüft werden. Bitte später erneut versuchen.','download-error':'Download fehlgeschlagen. Bitte erneut versuchen.'};
  const action=u.status==='ready'?'install':['available','download-error'].includes(u.status)?'download':'check';
  const label={check:'Nach Updates suchen',download:'Update herunterladen',install:'Jetzt neu starten'}[action];
  const disabled=['unavailable','checking','downloading','installing'].includes(u.status);
  return `<h2>${tr('Updates')}</h2><p class="hint">Machen ${escapeHtml(u.version)}${u.target?' → '+escapeHtml(u.target):''}</p><p role="status">${tr(messages[u.status])}${u.status==='downloading'?' '+u.progress+'%':''}</p><button type="button" data-update="${action}" ${disabled?'disabled':''}>${tr(label)}</button>`;
}
function paintUpdates(){
  document.querySelectorAll('[data-update-settings]').forEach(el=>el.innerHTML=updateControls());
  const versionParts=value=>String(value||'').match(/\d+/g)?.map(Number)||[];
  const isNewer=(target,current)=>{const next=versionParts(target),installed=versionParts(current);for(let index=0;index<Math.max(next.length,installed.length);index++){const difference=(next[index]||0)-(installed[index]||0);if(difference)return difference>0;}return false;};
  const showNotice=['available','ready'].includes(updateState?.status)&&isNewer(updateState?.target,updateState?.version);
  document.querySelectorAll('[data-settings-update-dot],[data-updates-tab-dot]').forEach(dot=>dot.hidden=!showNotice);
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-update]');if(!button)return;
  button.disabled=true;
  try{
    if(button.dataset.update==='install'&&!await askInApp(tr('Update installieren?'),tr('Machen wird neu gestartet. Nicht gespeicherte Eingaben in beiden Fenstern werden verworfen. Speichere sie vorher oder wähle Abbrechen.'),tr('Jetzt neu starten')))return;
    updateState=await call('update:'+button.dataset.update);
  }catch(err){toast(tr(err.message));}finally{paintUpdates();}
});
window.api.onUpdate(next=>{updateState=next;paintUpdates();});
if(!new URLSearchParams(location.search).has('quick')&&!new URLSearchParams(location.search).has('pinned'))window.api.call('update:state').then(next=>{updateState=next;paintUpdates();}).catch(()=>{});
