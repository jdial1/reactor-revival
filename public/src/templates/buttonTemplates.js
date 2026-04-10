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

export const loadGameUploadRowTemplate = `<button id="splash-load-game-btn" class="splash-btn splash-btn-load splash-btn-full-width">
  <div class="load-game-header"><span>Load Local Game</span></div>
  <div class="load-game-details">
    <div class="money">&#36;{{currentMoney}}</div>
    <div class="played-time">{{playedTime}}</div>
  </div>
  <div class="synced-label" style="{{syncedStyle}}"></div>
</button>`;

export const buyButtonTemplate = `<button class="pixel-btn"{{disabledAttr}} aria-label="{{ariaLabel}}">
  Buy
  <img src="img/ui/icons/icon_cash.png" class="icon-inline" alt="cash" style="{{cashIconStyle}}">
  <span class="cost-text">{{costDisplay}}</span>
</button>`;

export const tooltipCloseButtonTemplate = `<button id="tooltip_close_btn" title="Close" aria-label="Close tooltip">×</button>`;

export const helpButtonTemplate = `<button class="help-btn" title="{{title}}" aria-label="{{title}}">?</button>`;

export const loadingButtonTemplate = `<button class="splash-btn splash-btn-load" disabled>
  <div class="loading-container">
    <div class="{{spinnerClass}}"></div>
    <span class="loading-text">{{text}}</span>
  </div>
</button>`;

export const installButtonTemplate = `<button class="contrast">Install App</button>`;
