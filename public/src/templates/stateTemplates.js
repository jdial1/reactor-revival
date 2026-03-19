export const cloudConflictModalTemplate = `<div class="bios-overlay-content" style="max-width: 480px;">
  <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Cloud vs Local save</h2>
  <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 0.75rem;">Choose which save to use:</p>
  <div class="cloud-local-comparison" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; font-size: 0.65rem; margin-bottom: 1rem;">
    <span style="color: rgb(150 160 240); font-weight: bold;">Cloud</span>
    <span style="color: rgb(150 200 150); font-weight: bold;">Local</span>
    <span>&#36;{{cloudMoney}}</span>
    <span>&#36;{{localMoney}}</span>
    <span>{{cloudEp}} EP</span>
    <span>{{localEp}} EP</span>
    <span>{{cloudPlaytime}}</span>
    <span>{{localPlaytime}}</span>
    <span>{{cloudTimestamp}}</span>
    <span>{{localTimestamp}}</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    <button type="button" class="splash-btn splash-btn-load" data-action="use-cloud">Use Cloud save</button>
    <button type="button" class="splash-btn" data-action="use-local">Keep Local save</button>
    <button type="button" class="splash-btn splash-btn-exit" data-action="cancel">Cancel</button>
  </div>
</div>`;

export const backupModalTemplate = `<div class="bios-overlay-content" style="max-width: 420px;">
  <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Save file corrupted</h2>
  <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 1rem;">The current save could not be read. Load from backup?</p>
  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    <button type="button" class="splash-btn" data-action="load-backup">Load backup</button>
    <button type="button" class="splash-btn splash-btn-exit" data-action="cancel">Cancel</button>
  </div>
</div>`;
