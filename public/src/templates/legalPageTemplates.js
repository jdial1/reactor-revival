import { html } from "lit-html";

function legalBackFooter(embeddedInApp) {
  if (embeddedInApp) {
    return html`
      <footer class="page-footer">
        <a href="#reactor_section" data-page="reactor_section" class="back-link">← Back to Game</a>
      </footer>
    `;
  }
  return html`
    <footer class="page-footer">
      <a href="index.html" class="back-link">← Back to Game</a>
    </footer>
  `;
}

export function privacyPolicyPageContainerTemplate(embeddedInApp = true) {
  return html`
    <div class="page-container">
      <header class="page-header">
        <h1>Privacy Policy</h1>
        <p class="page-subtitle">Reactor Revival · Last updated: <span id="privacy-policy-date"></span></p>
      </header>
      <main class="page-content">
        <section class="tos-section">
          <h2>Introduction</h2>
          <p>
            Welcome to Reactor Revival. This Privacy Policy explains how your information is handled when you use our web application. Your privacy is important to us, and we are committed to protecting it.
          </p>
        </section>
        <section class="tos-section">
          <h2>Information We Collect and Use</h2>
          <div class="highlight-box">
            <div class="highlight-icon">🔒</div>
            <p>
              <strong>We do not collect any personal data.</strong> Reactor Revival is designed to respect your privacy. All game data is stored locally on your device or, optionally, in your own Google Drive account.
            </p>
          </div>
          <h3>Data Storage Methods</h3>
          <ul>
            <li>
              <strong>Local Storage:</strong> Your game progress is saved in your browser's local storage. This data is not transmitted to any servers.
            </li>
            <li>
              <strong>Google Drive (Optional):</strong> If you choose to connect your Google account, your game save file will be stored in your Google Drive. The application only has permission to access the files it creates. We do not have access to any other files in your Drive. This feature is provided for your convenience to back up and sync your game data.
            </li>
          </ul>
        </section>
        <section class="tos-section">
          <h2>Third-Party Services</h2>
          <p>
            The optional Google Drive integration is subject to the
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>. We do not receive or store your Google account credentials.
          </p>
        </section>
        <section class="tos-section">
          <h2>Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last Updated" date.</p>
        </section>
        <section class="tos-section">
          <h2>Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please visit our
            <a href="https://github.com/jdial1/reactor-revival" target="_blank" rel="noopener noreferrer">GitHub repository</a>.
          </p>
        </section>
      </main>
      ${legalBackFooter(embeddedInApp)}
    </div>
  `;
}

export function termsOfServicePageContainerTemplate(embeddedInApp = true) {
  return html`
    <div class="page-container">
      <header class="page-header">
        <h1>Terms of Service</h1>
        <p class="page-subtitle">Last Updated: December 2024</p>
      </header>
      <main class="page-content">
        <section class="tos-section">
          <h2>1. Acceptance of Terms</h2>
          <div class="highlight-box">
            <div class="highlight-icon">📋</div>
            <p>By accessing and playing Reactor Revival, you agree to be bound by these Terms of Service and all applicable laws and regulations.</p>
          </div>
        </section>
        <section class="tos-section">
          <h2>2. Game Description</h2>
          <p>Reactor Revival is an incremental/idle game where players build and manage nuclear reactors. The game is provided for entertainment purposes only.</p>
        </section>
        <section class="tos-section">
          <h2>3. User Conduct</h2>
          <p>You agree to use the game responsibly and not to:</p>
          <ul>
            <li>Attempt to reverse engineer or modify the game code</li>
            <li>Use automated tools or scripts to gain unfair advantages</li>
            <li>Interfere with the game's functionality or other players' experience</li>
            <li>Use the game for any illegal or unauthorized purpose</li>
          </ul>
        </section>
        <section class="tos-section">
          <h2>4. Game Modifications</h2>
          <p>The developers reserve the right to:</p>
          <ul>
            <li>Modify, update, or discontinue the game at any time</li>
            <li>Add or remove features without prior notice</li>
            <li>Reset game progress if necessary for technical reasons</li>
          </ul>
        </section>
        <section class="tos-section">
          <h2>5. Disclaimers</h2>
          <div class="highlight-box warning">
            <div class="highlight-icon">⚠️</div>
            <p>The game is provided "as is" without warranties of any kind. The developers are not responsible for any data loss or technical issues.</p>
          </div>
        </section>
        <section class="tos-section">
          <h2>6. Limitation of Liability</h2>
          <p>In no event shall the developers be liable for any indirect, incidental, special, or consequential damages arising from your use of the game.</p>
        </section>
        <section class="tos-section">
          <h2>7. Termination</h2>
          <p>Your right to use the game may be terminated at any time for violation of these terms or for any other reason at the developers' discretion.</p>
        </section>
        <section class="tos-section">
          <h2>8. Governing Law</h2>
          <p>These terms shall be governed by and construed in accordance with applicable laws.</p>
        </section>
        <section class="tos-section">
          <h2>9. Changes to Terms</h2>
          <p>We may update these Terms of Service from time to time. Any changes will be posted on this page with an updated "Last Updated" date.</p>
        </section>
        <section class="tos-section">
          <h2>10. Contact Information</h2>
          <p>If you have any questions about these Terms of Service, please contact us through the game's support channels.</p>
        </section>
      </main>
      ${legalBackFooter(embeddedInApp)}
    </div>
  `;
}
