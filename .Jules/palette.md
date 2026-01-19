## 2024-05-23 - Accessibility of Static HTML Buttons
**Learning:** Many icon-only buttons defined in static HTML files (`reactor.html`) were missing `aria-label` attributes, relying only on `title` which is insufficient for screen readers.
**Action:** When auditing accessibility, manually check all static HTML files in `public/pages/` for icon-only buttons and add descriptive `aria-label` attributes.
