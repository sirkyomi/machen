const REPOSITORY = 'https://github.com/sirkyomi/machen';
class Updates {
  constructor({version, createManager, notify = () => {}, quit = () => {}}) {
    this.notify = notify; this.quit = quit;
    this.state = {status: 'unavailable', version, target: '', progress: 0};
    try {
      this.manager = createManager();
      this.manager.getCurrentVersion();
      this.pending = this.manager.getUpdatePendingRestart();
      this.state.status = this.pending ? 'ready' : 'idle';
      this.state.target = this.pending?.Version || '';
    } catch { this.manager = null; }
  }
  snapshot() { return {...this.state}; }
  set(patch) { Object.assign(this.state, patch); this.notify(this.snapshot()); }
  async check() {
    if (!this.manager || ['checking','downloading','ready','installing'].includes(this.state.status)) return this.snapshot();
    this.set({status:'checking', target:'', progress:0});
    try {
      this.offer = await this.manager.checkForUpdatesAsync();
      this.set({status:this.offer?'available':'current',target:this.offer?.TargetFullRelease.Version || ''});
    } catch { this.offer = null; this.set({status:'check-error'}); }
    return this.snapshot();
  }
  async download() {
    if (!this.manager || !this.offer || !['available','download-error'].includes(this.state.status)) return this.snapshot();
    this.set({status:'downloading',progress:0});
    try {
      await this.manager.downloadUpdateAsync(this.offer, progress => this.set({progress:Math.max(0,Math.min(100,Math.round(progress)))}));
      this.pending = this.offer.TargetFullRelease;
      this.set({status:'ready',progress:100});
    } catch { this.set({status:'download-error'}); }
    return this.snapshot();
  }
  install() {
    if (!this.manager || !this.pending || this.state.status !== 'ready') return this.snapshot();
    try {
      this.manager.waitExitThenApplyUpdate(this.pending, false, true);
      this.set({status:'installing'}); this.quit();
    } catch { this.set({status:'ready'}); throw Error('Update konnte nicht installiert werden.'); }
    return this.snapshot();
  }
}
module.exports = {Updates, REPOSITORY};
