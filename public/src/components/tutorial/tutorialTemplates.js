import { html, render } from "lit-html";

export const tutorialOverlayTemplate = html`
  <div class="tutorial-spotlight-top"></div>
  <div class="tutorial-spotlight-left"></div>
  <div class="tutorial-spotlight-right"></div>
  <div class="tutorial-spotlight-bottom"></div>
  <div class="tutorial-focus-border"></div>
  <div class="tutorial-pointer" aria-hidden="true">
    <svg class="tutorial-pointer-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4l4 8-2 2 2 10 4-6 4 8 4-12-6-4-4-2-4-4z" fill="rgb(255 220 160)" stroke="rgb(180 140 80)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>
`;

export function tutorialCalloutTemplate(message, onSkip, onHardSkip) {
  return html`
    <div class="tutorial-message">${message}</div>
    <button type="button" class="tutorial-skip-btn" @click=${onSkip}>Skip</button>
    <button type="button" class="tutorial-hard-skip-btn" @click=${onHardSkip}>Hard Skip</button>
  `;
}

export function renderTutorialCallout(container, message, onSkip, onHardSkip) {
  if (!container?.isConnected) return;
  try {
    render(tutorialCalloutTemplate(message, onSkip, onHardSkip), container);
  } catch (_) {}
}
