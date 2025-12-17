## 2024-05-24 - Accessibility for Complex Interactives
**Learning:** For interactive elements like "part selection" buttons that convey multiple pieces of information (identity, cost, status), a simple `aria-label` with just the name is insufficient.
**Action:** Include critical decision-making information (like cost) directly in the `aria-label` so screen reader users don't have to navigate into the element or guess. E.g., "Uranium Cell, Cost: 100".
