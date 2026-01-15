import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM } from '../helpers/setup.js';

describe('Upgrade Button UX', () => {
  let game;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
  });

  it('should have a descriptive aria-label on the buy button', () => {
    // Get a sample upgrade
    const upgrade = game.upgradeset.getUpgrade('improved_alloys');
    expect(upgrade).toBeDefined();

    // Create the element
    const el = upgrade.createElement();

    // Find the buy button
    const buyBtn = el.querySelector('.upgrade-action-btn');
    expect(buyBtn).not.toBeNull();

    // Check the aria-label
    const ariaLabel = buyBtn.getAttribute('aria-label');

    // Ensure the display cost is updated
    upgrade.updateDisplayCost();
    const expectedCost = upgrade.display_cost;
    const expectedLabel = `Buy ${upgrade.title} for ${expectedCost}`;

    expect(ariaLabel).toBe(expectedLabel);
  });
});
