export const SINGLE_CELL_DESC_TPL =
  "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
export const MULTI_CELL_DESC_TPL =
  "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";

const CELL_COUNTS_BY_LEVEL = [1, 2, 4];
const TITLE_PREFIX_STRIP = /Dual |Quad /;

function getBaseDescriptionTemplate(part) {
  const baseDescTpl = part.part.base_description;
  if (baseDescTpl === "%single_cell_description") return SINGLE_CELL_DESC_TPL;
  if (baseDescTpl === "%multi_cell_description") return MULTI_CELL_DESC_TPL;
  if (!baseDescTpl) {
    return part.part.cell_count > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL;
  }
  return baseDescTpl;
}

function getEffectiveTransfer(part, tile_context) {
  return tile_context ? tile_context.getEffectiveTransferValue() : part.transfer;
}

function getEffectiveVent(part, tile_context) {
  return tile_context ? tile_context.getEffectiveVentValue() : part.vent;
}


function getCellCountForDesc(part) {
  const cellLevelIndex = (part.part.level || 1) - 1;
  return CELL_COUNTS_BY_LEVEL[cellLevelIndex] ?? part.cell_count ?? 1;
}

function applyReplacements(baseDescTpl, part, fmt, effectiveTransfer, effectiveVent, cellCountForDesc) {
  const typeLabel = part.part.title.replace(TITLE_PREFIX_STRIP, "");
  return baseDescTpl
    .replace(/%power_increase/g, fmt(part.power_increase))
    .replace(/%heat_increase/g, fmt(part.heat_increase, 0))
    .replace(/%reactor_power/g, fmt(part.reactor_power))
    .replace(/%reactor_heat/g, fmt(part.reactor_heat, 0))
    .replace(/%ticks/g, fmt(part.ticks))
    .replace(/%containment/g, fmt(part.containment, 0))
    .replace(/%ep_heat/g, fmt(part.ep_heat, 0))
    .replace(/%range/g, fmt(part.range))
    .replace(/%count/g, cellCountForDesc)
    .replace(/%power/g, fmt(part.power))
    .replace(/%heat/g, fmt(part.heat, 0))
    .replace(/%transfer/g, fmt(effectiveTransfer))
    .replace(/%vent/g, fmt(effectiveVent))
    .replace(/%type/g, typeLabel);
}

export function buildPartDescription(part, fmt, tile_context = null) {
  const baseDescTpl = getBaseDescriptionTemplate(part);
  const effectiveTransfer = getEffectiveTransfer(part, tile_context);
  const effectiveVent = getEffectiveVent(part, tile_context);
  const cellCountForDesc = getCellCountForDesc(part);
  return applyReplacements(baseDescTpl, part, fmt, effectiveTransfer, effectiveVent, cellCountForDesc);
}
