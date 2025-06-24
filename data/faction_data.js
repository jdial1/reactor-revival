export const faction_data = [
  {
    id: "ATOM",
    name: "ATOM",
    flag: "🇺🇸",
    traits: [
      { type: "feature", icon: "🔧", text: "Small Modular Reactors" },
      { type: "feature", text: "Efficiency +10%" },
      {
        type: "penalty",
        icon: "❌",
        text: "No access to natural uranium fuel systems",
      },
      { type: "penalty", text: "Durability -10%" },
    ],
  },
  {
    id: "BLOK",
    name: "БЛОК",
    flag: "🇷🇺",
    traits: [
      { type: "feature", icon: "🛠️", text: "Fast Neutron Reactors" },
      { type: "feature", text: "Power Output +15%" },
      {
        type: "penalty",
        icon: "❌",
        text: "No access to molten salt reactor systems",
      },
      { type: "penalty", text: "Meltdown Chance +25%" },
    ],
  },
  {
    id: "ROD",
    name: "ROD",
    flag: "🇬🇧",
    traits: [
      { type: "feature", icon: "⚛️", text: "Dual-fuel Path" },
      { type: "feature", text: "Fuel Compatibility +10%" },
      {
        type: "penalty",
        icon: "❌",
        text: "No access to breeder or fast reactor systems",
      },
      { type: "penalty", text: "Max Power Scaling -15%" },
    ],
  },
  {
    id: "CORE",
    name: "CORE",
    flag: "🌐",
    traits: [
      { type: "feature", icon: "🛡️", text: "Ultra-safe Cores" },
      { type: "feature", text: "Meltdown Chance -20%" },
      {
        type: "penalty",
        icon: "❌",
        text: "No access to high-output core designs",
      },
      { type: "penalty", text: "Base Power -10%" },
    ],
  },
];
export default faction_data;
