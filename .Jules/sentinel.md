# Sentinel Journal - Security Hardening

## [2025-05-22] - XSS Mitigation in UI and PWA Services

### Vulnerability
Direct interpolation of user-controlled or dynamic data (emails, variable values) into  created multiple Stored and Reflected XSS vectors.

### Mitigation
1.  Extracted a centralized  utility in  that uses a browser-native dummy DOM element to safely escape text.
2.  Refactored the user email display in  to use  on a separate span, avoiding  for user data.
3.  Sanitized the debug panel string output in  using .
4.  Updated existing  usage in  to use the centralized  utility.

### Severity
Medium/High - Attackers could potentially execute arbitrary JS by setting a malicious email address or triggering specific debug states.

### Learnings
Vanilla JS applications are highly susceptible to XSS if  is favored over  or manual DOM construction. Always use a centralized escaping utility or browser-native safe APIs for any dynamic content.
# Sentinel Journal - Security Hardening

## [2025-05-22] - XSS Mitigation in UI and PWA Services

### Vulnerability
Direct interpolation of user-controlled or dynamic data (emails, variable values) into `innerHTML` created multiple Stored and Reflected XSS vectors.

### Mitigation
1.  Extracted a centralized `escapeHtml` utility in `public/src/utils/util.js` that uses a browser-native dummy DOM element to safely escape text.
2.  Refactored the user email display in `public/src/services/pwa.js` to use `textContent` on a separate span, avoiding `innerHTML` for user data.
3.  Sanitized the debug panel string output in `public/src/components/ui.js` using `escapeHtml`.
4.  Updated existing `innerHTML` usage in `public/src/app.js` to use the centralized `escapeHtml` utility.

### Severity
Medium/High - Attackers could potentially execute arbitrary JS by setting a malicious email address or triggering specific debug states.

### Learnings
Vanilla JS applications are highly susceptible to XSS if `innerHTML` is favored over `textContent` or manual DOM construction. Always use a centralized escaping utility or browser-native safe APIs for any dynamic content.
