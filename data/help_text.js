const help_text = {
  parts: {
    cells:
      "Cells are your primary power generators. They produce both power and heat.",
    reflectors: "Reflectors boost the power output of adjacent cells.",
    capacitors: "Capacitors increase your reactor's maximum power capacity. ",
    particleAccelerators:
      "Particle Accelerators generate Exotic Particles (EP) based on heat.",
    vents: "Vents actively cool your reactor by removing heat each tick.",
    heatExchangers:
      "Heat Exchangers evenly distribute heat between adjacent components.",
    heatInlets:
      "Heat Inlets push heat from adjacent components into the reactor.",
    heatOutlets:
      "Heat Outlets pull heat from the reactor into adjacent components.",
    coolantCells:
      "Coolant Cells passively absorb heat from adjacent components.",
    reactorPlatings:
      "Reactor Platings increase your reactor's maximum heat capacity.",
  },
  controls: {
    autoSell: "Automatically sells a portion of your power.",
    autoBuy:
      "Automatically replaces depleted components if you have Perpetual Power.",
    timeFlux: "Accelerates game time, making everything happen faster.",
    heatController: "Automatically reduces heat when it gets too high.",
    pause:
      "Pauses all reactor operations. Use this to plan changes or prevent accidents.",
  },
  upgrades: {
    general:
      "Upgrades provide permanent improvements to your reactor's capabilities.",
    experimental:
      "Experimental upgrades cost Exotic Particles (EP) and persist through reboots.",
  },
};

export default help_text;
