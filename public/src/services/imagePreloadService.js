import { logger } from "../utils/logger.js";

const partImagesByTier = {
  1: [
    'img/parts/accelerators/accelerator_1.png',
    'img/parts/capacitors/capacitor_1.png',
    'img/parts/cells/cell_1_1.png',
    'img/parts/cells/cell_1_2.png',
    'img/parts/cells/cell_1_4.png',
    'img/parts/coolants/coolant_cell_1.png',
    'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png',
    'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png',
    'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png',
  ],
  2: [
    'img/parts/accelerators/accelerator_2.png',
    'img/parts/capacitors/capacitor_2.png',
    'img/parts/cells/cell_2_1.png',
    'img/parts/cells/cell_2_2.png',
    'img/parts/cells/cell_2_4.png',
    'img/parts/coolants/coolant_cell_2.png',
    'img/parts/exchangers/exchanger_2.png',
    'img/parts/inlets/inlet_2.png',
    'img/parts/outlets/outlet_2.png',
    'img/parts/platings/plating_2.png',
    'img/parts/reflectors/reflector_2.png',
    'img/parts/vents/vent_2.png',
  ],
  3: [
    'img/parts/accelerators/accelerator_3.png',
    'img/parts/capacitors/capacitor_3.png',
    'img/parts/cells/cell_3_1.png',
    'img/parts/cells/cell_3_2.png',
    'img/parts/cells/cell_3_4.png',
    'img/parts/coolants/coolant_cell_3.png',
    'img/parts/exchangers/exchanger_3.png',
    'img/parts/inlets/inlet_3.png',
    'img/parts/outlets/outlet_3.png',
    'img/parts/platings/plating_3.png',
    'img/parts/reflectors/reflector_3.png',
    'img/parts/vents/vent_3.png',
  ],
  4: [
    'img/parts/accelerators/accelerator_4.png',
    'img/parts/capacitors/capacitor_4.png',
    'img/parts/cells/cell_4_1.png',
    'img/parts/cells/cell_4_2.png',
    'img/parts/cells/cell_4_4.png',
    'img/parts/coolants/coolant_cell_4.png',
    'img/parts/exchangers/exchanger_4.png',
    'img/parts/inlets/inlet_4.png',
    'img/parts/outlets/outlet_4.png',
    'img/parts/platings/plating_4.png',
    'img/parts/reflectors/reflector_4.png',
    'img/parts/vents/vent_4.png',
  ],
  5: [
    'img/parts/accelerators/accelerator_5.png',
    'img/parts/capacitors/capacitor_5.png',
    'img/parts/coolants/coolant_cell_5.png',
    'img/parts/exchangers/exchanger_5.png',
    'img/parts/inlets/inlet_5.png',
    'img/parts/outlets/outlet_5.png',
    'img/parts/platings/plating_5.png',
    'img/parts/cells/cell_5_1.png',
    'img/parts/cells/cell_5_2.png',
    'img/parts/cells/cell_5_4.png',
    'img/parts/reflectors/reflector_5.png',
    'img/parts/vents/vent_5.png',
  ],
  6: [
    'img/parts/accelerators/accelerator_6.png',
    'img/parts/capacitors/capacitor_6.png',
    'img/parts/cells/cell_6_1.png',
    'img/parts/cells/cell_6_2.png',
    'img/parts/cells/cell_6_4.png',
    'img/parts/cells/xcell_1_1.png',
    'img/parts/cells/xcell_1_2.png',
    'img/parts/cells/xcell_1_4.png',
    'img/parts/coolants/coolant_cell_6.png',
    'img/parts/exchangers/exchanger_6.png',
    'img/parts/inlets/inlet_6.png',
    'img/parts/outlets/outlet_6.png',
    'img/parts/platings/plating_6.png',
    'img/parts/reflectors/reflector_6.png',
    'img/parts/vents/vent_6.png',
  ],
};

const maxTier = 6;

function getUiIconAssets() {
  return [
    'img/ui/icons/icon_cash.png', 'img/ui/icons/icon_heat.png',
    'img/ui/icons/icon_power.png', 'img/ui/icons/icon_time.png',
    'img/ui/icons/icon_inlet.png', 'img/ui/icons/icon_outlet.png',
    'img/ui/icons/icon_vent.png', 'img/ui/icons/icon_cash_outline.svg',
    'img/ui/icons/icon_copy.svg', 'img/ui/icons/icon_deselect.svg',
    'img/ui/icons/icon_dropper.svg', 'img/ui/icons/icon_paste.svg',
  ];
}

function getStatusAndNavAssets() {
  return [
    'img/ui/status/status_bolt.png', 'img/ui/status/status_infinity.png',
    'img/ui/status/status_plus.png', 'img/ui/status/status_star.png',
    'img/ui/status/status_time.png', 'img/ui/nav/nav_experimental.png',
    'img/ui/nav/nav_normal.png', 'img/ui/nav/nav_pause.png',
    'img/ui/nav/nav_play.png', 'img/ui/nav/nav_renew.png',
    'img/ui/nav/nav_unrenew.png',
  ];
}

function getBorderAndPanelAssets() {
  return [
    'img/ui/borders/button/button_border.png', 'img/ui/borders/button/button_border_alt.png',
    'img/ui/borders/button/button_border_alt_active.png', 'img/ui/borders/button/button_border_alt_down.png',
    'img/ui/borders/button/button_border_alt_down_active.png', 'img/ui/borders/button/small_button_down.png',
    'img/ui/borders/button/small_button_off.png', 'img/ui/borders/button/small_button_on.png',
    'img/ui/borders/panel/medium_panel.png', 'img/ui/borders/panel/panel_border.png',
    'img/ui/borders/panel/panel_border_first_first.png', 'img/ui/borders/panel/panel_border_first_last.png',
    'img/ui/borders/panel/panel_border_last_first.png', 'img/ui/borders/panel/panel_border_last_last.png',
    'img/ui/borders/panel/panel_border_last_middle.png',
  ];
}

function getInnerAndFlowAssets() {
  return [
    'img/ui/inner/inner_border.png', 'img/ui/inner/inner_border_alt.png',
    'img/ui/inner/inner_border_alt_active.png', 'img/ui/inner/inner_border_alt_down.png',
    'img/ui/inner/inner_border_alt_flip.png', 'img/ui/inner/inner_border_alt_flip_active.png',
    'img/ui/inner/inner_border_alt_flip_down.png', 'img/ui/flow/flow-arrow-down.svg',
    'img/ui/flow/flow-arrow-left.svg', 'img/ui/flow/flow-arrow-right.svg',
    'img/ui/flow/flow-arrow-up.svg', 'img/ui/effects/explosion_map.png',
    'img/ui/connector_border.png', 'img/ui/tile.png',
  ];
}

function getPartAssets() {
  return [
    'img/parts/cells/cell_1_1.png', 'img/parts/cells/cell_1_2.png', 'img/parts/cells/cell_1_4.png',
    'img/parts/accelerators/accelerator_1.png', 'img/parts/capacitors/capacitor_1.png',
    'img/parts/coolants/coolant_cell_1.png', 'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png', 'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png', 'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png', 'img/parts/valves/valve_1_1.png',
    'img/parts/valves/valve_1_2.png', 'img/parts/valves/valve_1_3.png',
    'img/parts/valves/valve_1_4.png',
  ];
}

export function getCriticalUiIconAssets() {
  return [
    ...getUiIconAssets(),
    ...getStatusAndNavAssets(),
    ...getBorderAndPanelAssets(),
    ...getInnerAndFlowAssets(),
    ...getPartAssets(),
  ];
}

export async function warmImageCache(imagePaths) {
  const loadPromises = imagePaths.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve({ success: true, path: imagePath });
        img.onerror = () => resolve({ success: false, path: imagePath });
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      return { success: false, path: imagePath, error };
    }
  });
  try {
    const results = await Promise.allSettled(loadPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
    if (failed > 0) {
      const failedAssets = results
        .filter(r => r.status === 'fulfilled' && !r.value.success)
        .map(r => r.value.path);
      logger.log('warn', 'ui', `[PWA] Failed to preload: ${failedAssets.join(', ')}`);
    }
  } catch (error) {
    console.warn('[PWA] Image cache warming encountered an error:', error);
  }
}

export async function preloadTierImages(tier) {
  const tierImages = partImagesByTier[tier] || [];
  if (tierImages.length === 0) {
    return;
  }
  const loadPromises = tierImages.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve(imagePath);
        img.onerror = () => resolve(imagePath);
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      logger.log('warn', 'ui', `[PWA] Error preloading tier ${tier} image ${imagePath}:`, error);
      return imagePath;
    }
  });
  await Promise.allSettled(loadPromises);
}

export async function preloadAllPartImages() {
  const tierPromises = Array.from({ length: maxTier }, (_, i) => preloadTierImages(i + 1));
  await Promise.all(tierPromises);
}

export function getPartImagesByTier() {
  return partImagesByTier;
}

export function getMaxTier() {
  return maxTier;
}
