## 2024-05-22 - Accessible Icon-Only Buttons
**Learning:** This codebase relies heavily on icon-only buttons for navigation and tools. While `title` attributes were present, they are not sufficient for full accessibility. Adding `aria-label` provides a reliable accessible name for screen readers.
**Action:** When creating new buttons with icons, always include an `aria-label` that describes the action, especially if the button contains no visible text.
