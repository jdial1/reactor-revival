# Reactor Revival: Asset Management Guidelines


4. High Resolution Exception
4.1 Exempt Images


4.2 Usage Contexts

These images are used for:

    PWA Manifest Icons: App icons for mobile devices
    Browser Favicons: Website favicon display
    App Store Icons: High-resolution app store listings
    High-DPI Displays: Retina and 4K displays

4.3 Implementation

These images continue to use direct file paths:

{
"src": "img/parts/cells/cell_1_1-192x192.png",
"sizes": "192x192",
"type": "image/png"
}



6. Performance Monitoring
6.1 Asset Loading Metrics

Monitor these key performance indicators:

    Total HTTP Requests: Should be minimal for image assets
    Largest Contentful Paint: Should remain consistent
    Cumulative Layout Shift: Should be minimal

6.2 Optimization Checklist


    High-res cell 1 images remain individual files
    CSS classes follow naming convention
    No direct image paths in component code

7. Migration from Individual Images
7.1 Legacy Code

When encountering legacy code using individual images:

element.style.backgroundImage = 'url(img/parts/cells/cell_1_1.png)';
const style = getImageStyle('img/parts/cells/cell_1_1.png');
element.className = style.className;

7.2 Batch Migration



    Fallback Issues: Ensure individual images exist for development

8.2 Debug Tools

    Browser DevTools: Inspect element to verify CSS classes

9. Best Practices
9.1 Development Workflow


    Clear Naming: Use descriptive names for CSS classes
9.2 Code Quality


    Avoid Hardcoding: Don't hardcode image paths in components
    Performance Test: Monitor loading times after changes

9.3 Maintenance

    Backup Strategy: Maintain individual images for development

This document should be updated whenever new asset management patterns are introduced or existing guidelines are modified.
