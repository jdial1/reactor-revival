import { html } from "lit-html";

const DEFAULT_MESSAGE = "The game engine stopped unexpectedly. Try restarting or refresh the page.";

export const reactorFailedToStartTemplate = ({ errorMessage, onTryAgain, onDismiss }) => html`
  <div class="reactor-failed-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
    <div class="reactor-failed-modal pixel-panel">
      <h2 class="reactor-failed-title">Reactor Failed to Start</h2>
      <p class="reactor-failed-message">${errorMessage ?? DEFAULT_MESSAGE}</p>
      <div class="reactor-failed-actions">
        <button type="button" class="pixel-btn" @click=${onTryAgain}>Try Again</button>
        <button type="button" class="pixel-btn secondary" @click=${onDismiss}>Dismiss (Pause)</button>
      </div>
    </div>
  </div>
`;
