## 2024-05-23 - [Accessibility]
**Learning:** Icon-only buttons MUST have `aria-label` attributes for screen readers. Native tooltips (`title` attribute) are not sufficient for accessibility and are often not read by screen readers or are difficult to trigger.
**Action:** When creating icon-only buttons, always include an `aria-label` describing the action.
