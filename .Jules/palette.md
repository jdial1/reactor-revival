## 2024-05-23 - Range Input Feedback
**Learning:** Range inputs (sliders) often lack immediate feedback about their precise value, relying on visual approximation. Adding a live-updating text readout (like a percentage) next to the slider significantly improves precision and user confidence without cluttering the UI.
**Action:** Always pair range inputs with a dynamic text readout element (like span) that updates on the input event.

## 2026-02-02 - Tactile Feedback for Grid Interactions
**Learning:** Adding subtle visual feedback for placement (the "pop") and hover states (lift/brightness) makes a grid-based interface feel much more tactile and responsive. Placing and selling items benefit from floating text for monetary feedback.
**Action:** Implement active and hover states for all primary interactive elements. Use the reflow trick (`void element.offsetWidth`) to reliably re-trigger CSS animations on repeated actions. Use overlay-based floating text for sell feedback.
