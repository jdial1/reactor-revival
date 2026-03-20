import { render } from "lit-html";
import {
  privacyPolicyPageContainerTemplate,
  termsOfServicePageContainerTemplate,
} from "./templates/legalPageTemplates.js";

const root = document.getElementById("legal-root");
const kind = document.documentElement.dataset.legalPage;

async function fillPrivacyDate() {
  const el = document.getElementById("privacy-policy-date");
  if (!el) return;
  try {
    const response = await fetch("version.json");
    if (response.ok) {
      const versionData = await response.json();
      const version = versionData.version;
      const parts = version.split("-")[0].split("_");
      if (parts.length === 3) {
        const day = parts[0];
        const month = parts[1];
        const year = "20" + parts[2];
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const monthName = monthNames[parseInt(month, 10) - 1];
        el.textContent = `${monthName} ${day}, ${year}`;
        return;
      }
    }
  } catch (_) {}
  el.textContent = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

if (root) {
  if (kind === "privacy") {
    render(privacyPolicyPageContainerTemplate(false), root);
    void fillPrivacyDate();
  } else if (kind === "terms") {
    render(termsOfServicePageContainerTemplate(false), root);
  }
}
