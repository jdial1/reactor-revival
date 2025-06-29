export function createFactionCard(faction) {
  const card = window.templateLoader.cloneTemplateElement(
    "faction-card-template"
  );
  if (!card) return null;

  // Set faction data
  card.className = `faction-card faction-${faction.id}`;
  card.dataset.faction = faction.id;

  // Set header content
  window.templateLoader.setText(card, ".flag", faction.flag);
  window.templateLoader.setText(card, ".faction-name", faction.name);

  // Add traits
  const cardBody = card.querySelector(".card-body");
  faction.traits.forEach((trait) => {
    const templateId =
      trait.type === "feature"
        ? "faction-trait-feature-template"
        : "faction-trait-penalty-template";
    const traitBox = window.templateLoader.cloneTemplateElement(templateId);
    if (traitBox) {
      if (trait.icon) {
        window.templateLoader.setText(traitBox, ".icon", trait.icon);
      } else {
        window.templateLoader.setVisible(traitBox, ".icon", false);
      }
      window.templateLoader.setText(traitBox, ".trait-text", trait.text);
      cardBody.appendChild(traitBox);
    }
  });

  return card;
}
