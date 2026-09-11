const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('api',{
  call:(action,data)=>ipcRenderer.invoke('app:call',action,data),
  onChange:fn=>{const listener=()=>fn();ipcRenderer.on('app:changed',listener);return ()=>ipcRenderer.removeListener('app:changed',listener);},
  onUpdate:fn=>{const listener=(_event,next)=>fn(next);ipcRenderer.on('app:update',listener);return ()=>ipcRenderer.removeListener('app:update',listener);},
  onFocus:fn=>ipcRenderer.on('app:focus',()=>fn()),
  onOpenTask:fn=>ipcRenderer.on('app:openTask',(_event,id)=>fn(id))
});
