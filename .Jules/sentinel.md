# Sentinel's Journal

This document tracks systemic security vulnerabilities and recurring patterns discovered in this codebase.

| Date       | Title                         | Learning                                                                                                                              | Action                                                                                                             |
|------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| 2024-08-14 | Unmaintained Dev Dependencies | The project uses `live-server`, an unmaintained package with known vulnerabilities, as its development server. This increases the attack surface for developers and can lead to downstream security issues. | Replaced `live-server` with `vite`, a modern and actively maintained development server that was already a dependency. |
| 2025-05-22 | XSS Mitigation in UI and PWA  | Direct interpolation of user data into `innerHTML` created Stored/Reflected XSS vectors. Vanilla JS is susceptible if `innerHTML` is favored over `textContent` or centralized escaping. | Centralized `escapeHtml` in util.js; hardened email in pwa.js with `textContent`; sanitized debug panel in ui.js; migrated app.js to shared utility. |
