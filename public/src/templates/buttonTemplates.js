export const startButtonTemplate = `<button id="splash-new-game-btn" class="splash-btn splash-btn-start"{{disabledAttr}}>
  New Game
</button>`;

export const loadGameButtonFullWidthTemplate = `<button id="splash-load-game-btn" class="splash-btn splash-btn-load splash-btn-full-width">
  <div class="load-game-header"><span>Load Local Game</span></div>
  <div class="load-game-details">
    <div class="money">&#36;{{currentMoney}}</div>
    <div class="played-time">{{playedTime}}</div>
  </div>
</button>`;

export const loadGameButtonTemplate = `<button id="splash-load-game-btn" class="splash-btn splash-btn-load">
  <div class="load-game-header"><span>Load Local Game</span></div>
  <div class="load-game-details">
    <div class="money">&#36;{{currentMoney}}</div>
    <div class="played-time">{{playedTime}}</div>
  </div>
  <div class="synced-label" style="{{syncedStyle}}"></div>
</button>`;

export const loadGameUploadRowTemplate = `<div class="splash-btn-group">
  <button id="splash-load-game-btn" class="splash-btn splash-btn-load splash-btn-left">
    <div class="load-game-header"><span>Load Local Game</span></div>
    <div class="load-game-details">
      <div class="money">&#36;{{currentMoney}}</div>
      <div class="played-time">{{playedTime}}</div>
    </div>
    <div class="synced-label" style="{{syncedStyle}}"></div>
  </button>
  <button id="splash-upload-option-btn" class="splash-btn splash-btn-cloud upload-option-button splash-btn-right" title="Upload local save to Google Drive">
    <div class="upload-text">Upload</div>
  </button>
</div>`;

export const buyButtonTemplate = `<button class="pixel-btn"{{disabledAttr}} aria-label="{{ariaLabel}}">
  Buy
  <img src="img/ui/icons/icon_cash.png" class="icon-inline" alt="cash" style="{{cashIconStyle}}">
  <span class="cost-text">{{costDisplay}}</span>
</button>`;

export const tooltipCloseButtonTemplate = `<button id="tooltip_close_btn" title="Close" aria-label="Close tooltip">×</button>`;

export const helpButtonTemplate = `<button class="help-btn" title="{{title}}" aria-label="{{title}}">?</button>`;

export const uploadToCloudButtonTemplate = `<button class="splash-btn splash-btn-cloud upload-option-button">
  <div class="upload-text">Upload</div>
</button>`;

export const loadFromCloudButtonTemplate = `<button id="splash-load-cloud-btn" class="splash-btn splash-btn-cloud">
  Load Cloud Save
</button>`;

export const googleSignInButtonTemplate = `<button id="splash-signin-btn" class="splash-btn splash-btn-google google-signin-button">
  <span>Google Sign In</span>
</button>`;

export const googleSignOutButtonTemplate = `<button id="splash-signout-btn" class="splash-btn splash-btn-cloud google-signout-button">
  Sign Out
</button>`;

export const cloudSaveButtonTemplate = `<button class="contrast splash-cloud-button">
  <div class="load-game-header">Load Cloud Save</div>
  <div class="load-game-details">
    <div class="money">&#36;{{currentMoney}}</div>
    <div class="played-time">{{playedTime}}</div>
  </div>
</button>`;

export const loadingButtonTemplate = `<button class="splash-btn splash-btn-load" disabled>
  <div class="loading-container">
    <div class="{{spinnerClass}}"></div>
    <span class="loading-text">{{text}}</span>
  </div>
</button>`;

export const installButtonTemplate = `<button class="contrast">Install App</button>`;

export const googleSignInIconButtonTemplate = `<button>
  <div class="google-signin-container">
    <svg width="24" height="24" viewBox="0 0 24 24" class="google-icon">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
    </svg>
    <span>Google Sign In</span>
  </div>
</button>`;
