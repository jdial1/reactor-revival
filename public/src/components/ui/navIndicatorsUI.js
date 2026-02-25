export class NavIndicatorsUI {
  constructor(ui) {
    this.ui = ui;
  }

  updateLeaderboardIcon() {
    if (typeof document === "undefined" || !this.ui.game) return;
    const icon = this.ui.game.cheats_used ? "🚷" : "🏆";
    const isDisabled = this.ui.game.cheats_used;
    const topNavButton = document.querySelector('#main_top_nav button[data-page="leaderboard_section"]');
    if (topNavButton) {
      topNavButton.textContent = icon;
      topNavButton.disabled = isDisabled;
      topNavButton.style.opacity = isDisabled ? "0.5" : "1";
      topNavButton.style.cursor = isDisabled ? "not-allowed" : "pointer";
      topNavButton.style.pointerEvents = isDisabled ? "none" : "auto";
    }
    const bottomNavButton = document.querySelector('#bottom_nav button[data-page="leaderboard_section"], footer#bottom_nav button[data-page="leaderboard_section"]');
    if (bottomNavButton) {
      bottomNavButton.textContent = icon;
      bottomNavButton.disabled = isDisabled;
      bottomNavButton.style.opacity = isDisabled ? "0.5" : "1";
      bottomNavButton.style.cursor = isDisabled ? "not-allowed" : "pointer";
      bottomNavButton.style.pointerEvents = isDisabled ? "none" : "auto";
    }
  }

  updateNavIndicators() {
    if (typeof document === "undefined" || !this.ui.game?.upgradeset) return;
    const hasAffordableUpgrades = this.ui.game.upgradeset.hasAffordableUpgrades();
    const hasAffordableResearch = this.ui.game.upgradeset.hasAffordableResearch();
    const upgradeButtons = document.querySelectorAll('[data-page="upgrades_section"]');
    const researchButtons = document.querySelectorAll('[data-page="experimental_upgrades_section"]');
    upgradeButtons.forEach((button) => {
      let indicator = button.querySelector('.nav-indicator');
      if (!hasAffordableUpgrades) {
        if (indicator) indicator.style.display = 'none';
        return;
      }
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'nav-indicator';
        button.style.position = 'relative';
        button.appendChild(indicator);
      }
      indicator.style.display = 'block';
    });
    researchButtons.forEach((button) => {
      let indicator = button.querySelector('.nav-indicator');
      if (!hasAffordableResearch) {
        if (indicator) indicator.style.display = 'none';
        return;
      }
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'nav-indicator';
        button.style.position = 'relative';
        button.appendChild(indicator);
      }
      indicator.style.display = 'block';
    });
  }
}
