const help_text = {
  parts: {
    cells:
      "Cells are your primary power generators. They produce both power and heat, with higher tiers offering increased output but requiring more heat management.",
    reflectors:
      "Reflectors boost the power output of adjacent cells. Place them next to cells to maximize power generation.",
    capacitors:
      "Capacitors increase your reactor's maximum power capacity. More capacitors allow you to hold more power before selling it.",
    particleAccelerators:
      "Particle Accelerators generate Exotic Particles (EP) based on heat. Higher heat levels increase EP generation chance.",
    vents:
      "Vents actively cool your reactor by removing heat each tick. More powerful vents handle higher heat loads but cost more.",
    heatExchangers:
      "Heat Exchangers transfer heat between adjacent components, helping distribute heat evenly across your reactor.",
    heatInlets:
      "Heat Inlets push heat from adjacent components into the reactor.",
    heatOutlets:
      "Heat Outlets pull heat from the reactor into adjacent components.",
    coolantCells:
      "Coolant Cells passively absorb heat from adjacent components. They have high heat capacity but don't actively vent heat.",
    reactorPlatings:
      "Reactor Platings increase your reactor's maximum heat capacity. More platings allow you to run hotter safely.",
  },
  controls: {
    autoSell: "Automatically sells power when your power capacity is full.",
    autoBuy:
      "Automatically replaces depleted components if you can afford them.",
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
