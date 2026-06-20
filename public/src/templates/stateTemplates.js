export const backupModalTemplate = `<div class="bios-overlay-content" style="max-width: 420px;">
  <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Save file corrupted</h2>
  <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 1rem;">The current save could not be read. Load from backup?</p>
  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    <button type="button" class="splash-btn" data-action="load-backup">Load backup</button>
    <button type="button" class="splash-btn splash-btn-exit" data-action="cancel">Cancel</button>
  </div>
</div>`;
