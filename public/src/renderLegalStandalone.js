import { render } from "lit-html";
import {
  privacyPolicyPageContainerTemplate,
  termsOfServicePageContainerTemplate,
  populatePrivacyPolicyDateElement,
} from "./templates/legalPageTemplates.js";

const root = document.getElementById("legal-root");
const kind = document.documentElement.dataset.legalPage;

if (root) {
  if (kind === "privacy") {
    render(privacyPolicyPageContainerTemplate(false), root);
    void populatePrivacyPolicyDateElement(document.getElementById("privacy-policy-date"));
  } else if (kind === "terms") {
    render(termsOfServicePageContainerTemplate(false), root);
  }
}
