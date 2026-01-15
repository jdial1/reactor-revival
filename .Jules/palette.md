## 2026-01-15 - Upgrade Button Accessibility
**Learning:** Dynamic components like `Upgrade` often manually manage their DOM. The "Buy" buttons in upgrade cards lacked `aria-label`, making them inaccessible to screen readers (announcing only "Buy $Cost").
**Action:** When working with dynamic component classes (Upgrade, Part), always check `createElement` and update methods (like `updateDisplayCost`) to ensure interactive elements have descriptive `aria-label` attributes.
