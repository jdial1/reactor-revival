import { numFormat as fmt } from "../js/util.js";

const objective_list_data = [
  {
    title: "Place your first Cell in the reactor by clicking '☰'",
    reward: 10,
    checkId: "firstCell",
  },
  {
    title: "Sell all your power by clicking 'Power'",
    reward: 10,
    checkId: "sellPower",
  },
  {
    title: "Reduce your Heat to 0 by clicking 'Heat'",
    reward: 10,
    checkId: "reduceHeat",
  },
  {
    title: "Put a Heat Vent next to a Cell",
    reward: 50,
    checkId: "ventNextToCell",
  },
  {
    title: "Purchase an Upgrade",
    reward: 100,
    checkId: "purchaseUpgrade",
  },
  {
    title: "Purchase a Dual Cell",
    reward: 25,
    checkId: "purchaseDualCell",
  },
  {
    title: "Have at least 10 Cells",
    reward: 200,
    checkId: "tenActiveCells",
  },
  {
    title: "Purchase a Perpetual Cell upgrade",
    reward: 1000,
    checkId: "perpetualUranium",
  },
  {
    title: "Purchase a Capacitor",
    reward: 100,
    checkId: "increaseMaxPower",
  },
  {
    title: "Generate at least 200 power per tick",
    reward: 1000,
    checkId: "powerPerTick200",
  },
  {
    title: "Purchase an Improved Chronometers upgrade",
    reward: 5000,
    checkId: "improvedChronometers"
  },
  {
    title: "Have 5 different kinds of components",
    reward: 2000,
    checkId: "fiveComponentKinds",
  },
  {
    title: "Have at least 10 Capacitors",
    reward: 5000,
    checkId: "tenCapacitors",
  },
  {
    title: "Generate at least 500 power per tick",
    reward: 5000,
    checkId: "powerPerTick500",
  },
  {
    title: "Upgrade Potent Uranium Cell to level 3 or higher",
    reward: 25000,
    checkId: "potentUranium3",
  },
  {
    title: "Auto-sell at least 500 power per tick",
    reward: 40000,
    checkId: "autoSell500",
  },
  // New intermediary objectives - Leap 1: Path to Plutonium
  {
    title: "Achieve a steady power generation of 1,000 per tick for at least 3 minutes.",
    reward: 200000,
    checkId: "sustainedPower1k",
  },
  {
    title: "Have at least 10 active Advanced Capacitors and 10 Advanced Heat Vents.",
    reward: 500000,
    checkId: "infrastructureUpgrade1",
  },
  {
    title: "Have at least 5 Quad Plutonium Cells",
    reward: 1000000,
    checkId: "fiveQuadPlutonium",
  },
  // Leap 2: The Expansion Effort
  {
    title: "Expand your reactor 2 times in either direction.",
    reward: 1100000,
    checkId: "initialExpansion2",
  },
  {
    title: "Achieve a passive income of $50,000 per tick through auto-selling.",
    reward: 15000000,
    checkId: "incomeMilestone50k",
  },
  {
    title: "Expand your reactor 4 times in either direction",
    reward: 100000000,
    checkId: "expandReactor4",
  },
  // Leap 3: The Billionaire's Club
  {
    title: "Have at least 5 Quad Thorium Cells.",
    reward: 600000000,
    checkId: "unlockThorium",
  },
  {
    title: "Reach a balance of $1,000,000,000.",
    reward: 1000000000,
    checkId: "firstBillion",
  },
  {
    title: () => `Have at least $${fmt(10000000000)}`,
    reward: 10000000000,
    checkId: "money10B",
  },
  // Leap 4: Entering the Quantum Realm
  {
    title: "Have at least 5 Quad Seaborgium Cells.",
    reward: 600000000000,
    checkId: "unlockSeaborgium",
  },
  {
    title: "Sustain a reactor heat level above 10,000,000 for 5 minutes without a meltdown.",
    reward: 2500000000000,
    checkId: "masterHighHeat",
  },
  {
    title: "Generate 10 Exotic Particles",
    reward: 10000000000000,
    checkId: "ep10",
  },
  {
    title: "Generate 51 Exotic Particles",
    ep_reward: 50,
    checkId: "ep51",
  },
  // Leap 5: The EP Grind
  {
    title: "Generate 250 Exotic Particles.",
    ep_reward: 250,
    checkId: "ep250",
  },
  {
    title: "Purchase the 'Infused Cells' and 'Unleashed Cells' experimental upgrades.",
    ep_reward: 500,
    checkId: "investInResearch1",
  },
  {
    title: "Reboot your reactor in the Research tab",
    ep_reward: 50,
    checkId: "reboot",
  },
  {
    title: "Purchase an Experimental Upgrade",
    ep_reward: 50,
    checkId: "experimentalUpgrade",
  },
  {
    title: "Have at least 5 Quad Dolorium Cells",
    reward: 1000000000000000,
    checkId: "fiveQuadDolorium",
  },
  {
    title: () => `Generate ${fmt(1000)} Exotic Particles`,
    ep_reward: 1000,
    checkId: "ep1000",
  },
  {
    title: "Have at least 5 Quad Nefastium Cells",
    reward: 100000000000000000,
    checkId: "fiveQuadNefastium",
  },
  {
    title: "Place an experimental part.",
    ep_reward: 10000,
    checkId: "placeExperimentalPart",
  },
  {
    title: "All objectives completed!",
    reward: 0,
    checkId: "allObjectives",
  },
];

export default objective_list_data;
