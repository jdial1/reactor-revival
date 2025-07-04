import part_list_data from "./part_list.js";

const upgrade_templates = [
  {
    id: "chronometer",
    type: "other",
    title: "Improved Chronometers",
    description: "+1 tick per second per level of upgrade.",
    cost: 10000,
    multiplier: 100,
    icon: "img/upgrades/upgrade_flux.png",
    actionId: "chronometer",
  },
  {
    id: "forceful_fusion",
    type: "other",
    title: "Forceful Fusion",
    description:
      "Cells produce 1% more power at 1k heat, 2% power at 2m heat etc. per level of upgrade.",
    cost: 10000,
    multiplier: 100,
    icon: "img/parts/cells/cell_1_1.png",
    actionId: "forceful_fusion",
  },
  {
    id: "heat_control_operator",
    type: "other",
    title: "Heat Control Operator",
    description:
      "Your reactor no longer automatically removes heat from itself when it is below its maximum heat capacity. This makes Forceful Fusion easier to maintain.",
    cost: 1000000,
    levels: 1,
    icon: "img/upgrades/upgrade_computer.png",
    actionId: "heat_control_operator",
  },
  {
    id: "heat_outlet_control_operator",
    type: "other",
    title: "Better Heat Control Operator",
    description:
      "Your reactor outlets no longer output more heat than what the connected vents can handle.",
    erequires: "heat_control_operator",
    cost: 10000000,
    levels: 1,
    icon: "img/upgrades/upgrade_computer.png",
  },
  {
    id: "improved_piping",
    type: "other",
    title: "Improved Piping",
    description: "Venting manually is 10x as effective per level of upgrade.",
    cost: 100,
    multiplier: 20,
    icon: "img/parts/platings/plating_1.png",
    actionId: "improved_piping",
  },
  {
    id: "improved_alloys",
    type: "other",
    title: "Improved Alloys",
    description: "Plating holds 100% more heat per level of upgrade.",
    cost: 5000,
    multiplier: 5,
    icon: "img/parts/platings/plating_1.png",
    actionId: "improved_alloys",
  },
  {
    id: "improved_power_lines",
    type: "other",
    title: "Improved Power Lines",
    description: "Sells 1% of your power each tick per level of upgrade.",
    cost: 100,
    multiplier: 10,
    icon: "img/parts/capacitors/capacitor_1.png",
    actionId: "improved_power_lines",
  },
  {
    id: "improved_wiring",
    type: "other",
    title: "Improved Wiring",
    description: "Capacitors hold +100% power and heat per level of upgrade.",
    cost: 5000,
    multiplier: 5,
    icon: "img/parts/capacitors/capacitor_1.png",
    actionId: "improved_wiring",
  },
  {
    id: "perpetual_capacitors",
    type: "other",
    title: "Perpetual Capacitors",
    description:
      "If capacitors are on a cool surface when they go over their maximum heat containment, the heat is vented directly into the reactor and the capacitor is replaced. The capacitor costs 10 times the normal cost.",
    cost: 1000000000000000000,
    multiplier: 5,
    levels: 1,
    icon: "img/parts/capacitors/capacitor_1.png",
    actionId: "perpetual_capacitors",
  },
  {
    id: "improved_coolant_cells",
    type: "other",
    title: "Improved Coolant Cells",
    description: "Coolant cells hold 100% more heat per level of upgrade.",
    cost: 5000,
    multiplier: 100,
    icon: "img/parts/coolants/coolant_cell_1.png",
    actionId: "improved_coolant_cells",
  },
  {
    id: "improved_reflector_density",
    type: "other",
    title: "Improved Reflector Density",
    description: "Reflectors last 100% longer per level of upgrade.",
    cost: 5000,
    multiplier: 100,
    icon: "img/parts/reflectors/reflector_1.png",
  },
  {
    id: "improved_neutron_reflection",
    type: "other",
    title: "Improved Neutron Reflection",
    description:
      "Reflectors generate an additional 1% power per level of upgrade.",
    cost: 5000,
    multiplier: 100,
    icon: "img/parts/reflectors/reflector_1.png",
    actionId: "improved_neutron_reflection",
  },
  {
    id: "perpetual_reflectors",
    type: "other",
    title: "Perpetual Reflectors",
    description:
      "Reflectors are automtically replaced after being destroyed if they are on a cool surface. The replacement part will cost 1.5 times the normal cost.",
    cost: 1000000000,
    levels: 1,
    icon: "img/parts/reflectors/reflector_1.png",
    actionId: "perpetual_reflectors",
  },
  {
    id: "improved_heat_exchangers",
    type: "exchangers",
    title: "Improved Heat Exchangers",
    description:
      "Heat Exchangers, Inlets and Outlets hold and exchange 100% more heat per level of upgrade",
    cost: 600,
    multiplier: 100,
    icon: "img/parts/exchangers/exchanger_1.png",
    actionId: "improved_heat_exchangers",
  },
  {
    id: "reinforced_heat_exchangers",
    type: "exchangers",
    title: "Reinforced Heat Exchangers",
    description:
      "Each plating increases the amount of heat that exchangers can exchange by 1% per level of upgrade per level of plating.",
    cost: 1000,
    multiplier: 100,
    icon: "img/parts/platings/plating_1.png",
  },
  {
    id: "active_exchangers",
    type: "exchangers",
    title: "Active Exchangers",
    description:
      "Each capacitor increases the amount of heat that exchangers can exchange by 1% per level of upgrade per level of capacitor.",
    cost: 1000,
    multiplier: 100,
    icon: "img/parts/capacitors/capacitor_1.png",
  },
  {
    id: "improved_heat_vents",
    type: "vents",
    title: "Improved Heat Vents",
    description: "Vents hold and vent 100% more heat per level of upgrade.",
    cost: 250,
    multiplier: 100,
    icon: "img/parts/vents/vent_1.png",
  },
  {
    id: "improved_heatsinks",
    type: "vents",
    title: "Improved Heatsinks",
    description:
      "Each plating increases the amount of heat that vents can vent by 1% per level of upgrade per level of plating.",
    cost: 1000,
    multiplier: 100,
    icon: "img/parts/platings/plating_1.png",
    actionId: "improved_heatsinks",
  },
  {
    id: "active_venting",
    type: "vents",
    title: "Active Venting",
    description:
      "Each capacitor increases the effectiveness of heat that vents can vent by 1% per level of upgrade per level of capacitor.",
    cost: 1000,
    multiplier: 100,
    icon: "img/parts/capacitors/capacitor_1.png",
  },
  {
    id: "expand_reactor_rows",
    type: "other",
    title: "Expand Reactor Rows",
    description: "Add one row to the reactor for each level of the upgrade.",
    cost: 100,
    levels: 20,
    multiplier: 100,
    icon: "img/upgrades/upgrade_rows.png",
    actionId: "expand_reactor_rows",
  },
  {
    id: "expand_reactor_cols",
    type: "other",
    title: "Expand Reactor Cols",
    description: "Add one column to the reactor for each level of the upgrade.",
    cost: 100,
    levels: 20,
    multiplier: 100,
    icon: "img/upgrades/upgrade_cols.png",
    actionId: "expand_reactor_cols",
  },
  {
    id: "laboratory",
    type: "experimental_laboratory",
    title: "Laboratory",
    description: "Enables experimental upgrades.",
    ecost: 1,
    levels: 1,
    icon: "img/misc/lab.png",
  },
  {
    id: "infused_cells",
    type: "experimental_boost",
    title: "Infused Cells",
    description: "Cells produce 100% more power.",
    ecost: 100,
    multiplier: 2,
    levels: 10,
    icon: "img/parts/cells/cell_5_2.png",
  },
  {
    id: "unleashed_cells",
    type: "experimental_boost",
    title: "Unleashed Cells",
    description: "Cells produce 100% more power and heat.",
    ecost: 500,
    multiplier: 2,
    levels: 10,
    icon: "img/parts/cells/cell_6_4.png",
  },
  {
    id: "protium_cells",
    type: "experimental_cells",
    title: "Protium Cells",
    description: "Allows you to use protium cells.",
    erequires: "laboratory",
    ecost: 50,
    levels: 1,
    icon: "img/parts/cells/xcell_1_1.png",
  },
  {
    id: "quantum_buffering",
    type: "experimental_boost",
    title: "Quantum Buffering",
    description:
      "Capacitors and platings provide twice as much reactor power and heat capacity, and capacitors can contain twice as much heat per level of upgrade.",
    erequires: "laboratory",
    ecost: 50,
    multiplier: 2,
    icon: "img/parts/capacitors/capacitor_6.png",
    actionId: "quantum_buffering",
  },
  {
    id: "full_spectrum_reflectors",
    type: "experimental_boost",
    title: "Full Spectrum Reflectors",
    description:
      "Reflectors gain an additional 100% of their base power reflection per level of upgrade.",
    erequires: "laboratory",
    ecost: 50,
    multiplier: 2,
    icon: "img/parts/reflectors/reflector_6.png",
    actionId: "full_spectrum_reflectors",
  },
  {
    id: "fluid_hyperdynamics",
    type: "experimental_boost",
    title: "Fluid Hyperdynamics",
    description:
      "Heat vents, exchangers, inlets and outlets are two times as effective per level of upgrade.",
    erequires: "laboratory",
    ecost: 50,
    multiplier: 2,
    icon: "img/parts/exchangers/exchanger_6.png",
    actionId: "fluid_hyperdynamics",
  },
  {
    id: "fractal_piping",
    type: "experimental_boost",
    title: "Fractal Piping",
    description:
      "Heat vents and exchangers hold two times their base heat per level of upgrade.",
    erequires: "laboratory",
    ecost: 50,
    multiplier: 2,
    icon: "img/parts/exchangers/exchanger_6.png",
    actionId: "fractal_piping",
  },
  {
    id: "ultracryonics",
    type: "experimental_boost",
    title: "Ultracryonics",
    description:
      "Coolant cells hold two times their base heat per level of upgrade.",
    erequires: "laboratory",
    ecost: 50,
    multiplier: 2,
    icon: "img/parts/coolants/coolant_cell_6.png",
    actionId: "ultracryonics",
  },
  {
    id: "phlembotinum_core",
    type: "experimental_boost",
    title: "Phlembotinum Core",
    description:
      "Increase the base heat and power storage of the reactor by four times per level of upgrade.",
    erequires: "laboratory",
    ecost: 50,
    multiplier: 2,
    icon: "img/parts/platings/plating_6.png",
    actionId: "phlembotinum_core",
  },
  {
    id: "unstable_protium",
    type: "experimental_cells_boost",
    title: "Unstable Protium",
    description:
      "Protium cells last half as long and produce twice as much power and heat per level.",
    erequires: "protium_cells",
    ecost: 500,
    multiplier: 2,
    icon: "img/parts/cells/xcell_1_2.png",
    actionId: "unstable_protium",
  },
  {
    id: "heat_reflection",
    type: "experimental_parts",
    title: "Heat Reflection",
    description:
      "Allows you to use Thermal Neutron Reflectors. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/reflectors/reflector_6.png",
  },
  {
    id: "experimental_capacitance",
    type: "experimental_parts",
    title: "Experimental Capacitance",
    description:
      "Allows you to use Extreme Capacitors. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/capacitors/capacitor_6.png",
  },
  {
    id: "vortex_cooling",
    type: "experimental_parts",
    title: "Vortex Cooling",
    description:
      "Allows you to use Extreme Vents. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/vents/vent_6.png",
  },
  {
    id: "underground_heat_extraction",
    type: "experimental_parts",
    title: "Underground Heat Extraction",
    description:
      "Allows you to use Extreme Heat Exchangers. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/exchangers/exchanger_6.png",
  },
  {
    id: "vortex_extraction",
    type: "experimental_parts",
    title: "Vortex Extraction",
    description:
      "Allows you to use Extreme Heat Inlets. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/inlets/inlet_6.png",
  },
  {
    id: "explosive_ejection",
    type: "experimental_parts",
    title: "Explosive Ejection",
    description:
      "Allows you to use Extreme Heat Outlets. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/outlets/outlet_6.png",
  },
  {
    id: "thermionic_conversion",
    type: "experimental_parts",
    title: "Thermionic Conversion",
    description:
      "Allows you to use Thermionic Coolant Cells. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/coolants/coolant_6.png",
  },
  {
    id: "micro_capacitance",
    type: "experimental_parts",
    title: "Micro Capacitance",
    description:
      "Allows you to use Charged Reactor Plating. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/platings/plating_6.png",
  },
  {
    id: "singularity_harnessing",
    type: "experimental_parts",
    title: "Singularity Harnessing",
    description:
      "Allows you to use Black Hole Particle Accelerators. When purchased, the EP cost of other experimental part upgrades increases.",
    erequires: "laboratory",
    ecost: 10000,
    levels: 1,
    icon: "img/parts/accelerators/accelerator_6.png",
  },
];

for (let i = 1; i <= 6; i++) {
  const part = part_list_data.find(
    (p) => p.type === "particle_accelerator" && p.level === i
  );
  if (part) {
    upgrade_templates.push({
      id: `improved_particle_accelerators${i}`,
      type: "experimental_particle_accelerators",
      title: `Improved ${part.title}`,
      description: `Increase the maximum heat that ${part.title}s can use to create Exotic Particles by 100% per level of upgrade.`,
      erequires: "laboratory",
      ecost: 200 * i,
      multiplier: 2,
      part_level: i,
      icon: `img/parts/accelerators/accelerator_${i}.png`,
    });
  }
}

export default upgrade_templates;
