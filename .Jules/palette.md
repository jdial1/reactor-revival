## 2024-05-22 - Accessibility for Icon-Only Buttons
**Learning:** Adding 'aria-label' to icon-only buttons (like part selection and help buttons) is a simple but high-impact change for accessibility. It ensures screen reader users can understand the purpose of these buttons, which often rely on visual icons or tooltips.
**Action:** Always check for 'aria-label' on button templates that don't have visible text content.
## 2024-05-22 - Code Duplication in Part Creation
**Learning:** I found that 'createPartButton' in 'buttonFactory.js' is NOT the only place part buttons are created. The 'Part' class in 'public/src/core/part.js' also has a 'createElement' method that duplicates much of this logic, including cloning the template. This means changes to button creation need to be applied in BOTH places.
**Action:** When modifying component creation logic, always search the codebase for other usages of the template ID (e.g., 'part-btn-template') to ensure all instantiation points are covered.
