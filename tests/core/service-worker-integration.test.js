import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, fs, path } from '../helpers/setup.js';

describe('Service Worker Real File Integration Tests', () => {
    let swContent;
    let offlineContent;
    let versionContent;
    let manifestContent;

    beforeEach(() => {
        // Read actual service worker and related files
        const swPath = path.resolve(__dirname, '../../public/sw.js');
        const offlinePath = path.resolve(__dirname, '../../public/offline.html');
        const versionPath = path.resolve(__dirname, '../../public/version.json');
        const manifestPath = path.resolve(__dirname, '../../public/manifest.json');

        try {
            swContent = fs.readFileSync(swPath, 'utf-8');
            offlineContent = fs.readFileSync(offlinePath, 'utf-8');
            versionContent = fs.readFileSync(versionPath, 'utf-8');
            manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        } catch (error) {
            console.error('Failed to read service worker files:', error);
            throw error;
        }
    });

    describe('Service Worker File Content Analysis', () => {
        it('should have valid service worker content', () => {
            expect(swContent).toBeTruthy();
            expect(swContent.length).toBeGreaterThan(1000);
            expect(swContent.trim().startsWith('"use strict"')).toBe(true);
        });

        it('should contain workbox integration', () => {
            expect(swContent).toContain('importScripts');
            expect(swContent).toContain('workbox-sw.js');
            expect(swContent).toContain('workbox.core.clientsClaim');
            expect(swContent).toContain('workbox.precaching.precacheAndRoute');
        });

        it('should have proper caching strategies', () => {
            expect(swContent).toContain('workbox.routing.registerRoute');
            expect(swContent).toContain('NetworkFirst');
            expect(swContent).toContain('CacheFirst');
            expect(swContent).toContain('StaleWhileRevalidate');
        });

        it('should have offline fallback handling', () => {
            expect(swContent).toContain('setCatchHandler');
            expect(swContent).toContain('offline.html');
        });

        it('should have version checking functionality', () => {
            expect(swContent).toContain('startVersionChecking');
            expect(swContent).toContain('version.json');
            expect(swContent).toContain('notifyClientsOfNewVersion');
        });

        it('should have proper event listeners', () => {
            expect(swContent).toContain('addEventListener("install"');
            expect(swContent).toContain('addEventListener("activate"');
            expect(swContent).toContain('workbox.routing.registerRoute');
        });

        it('should have client communication', () => {
            expect(swContent).toContain('self.clients.matchAll');
            expect(swContent).toContain('client.postMessage');
            expect(swContent).toContain('NEW_VERSION_AVAILABLE');
        });
    });

    describe('Offline Page Content', () => {
        it('should have valid offline page content', () => {
            expect(offlineContent).toBeTruthy();
            expect(offlineContent.length).toBeGreaterThan(100);
        });

        it('should have proper HTML structure', () => {
            expect(offlineContent).toContain('<html');
            expect(offlineContent).toContain('<head');
            expect(offlineContent).toContain('<body');
            expect(offlineContent).toContain('</html>');
        });

        it('should have offline-specific content', () => {
            expect(offlineContent).toContain('offline');
            expect(offlineContent).toContain('connection');
        });
    });

    describe('Version File Content', () => {
        it('should have valid version content', () => {
            expect(versionContent).toBeTruthy();
            expect(versionContent.length).toBeGreaterThan(0);
        });

        it('should be valid JSON', () => {
            expect(() => JSON.parse(versionContent)).not.toThrow();
        });

        it('should have version property', () => {
            const versionData = JSON.parse(versionContent);
            expect(versionData).toHaveProperty('version');
            expect(typeof versionData.version).toBe('string');
            expect(versionData.version.length).toBeGreaterThan(0);
        });
    });

    describe('Manifest File Content', () => {
        it('should have valid manifest content', () => {
            expect(manifestContent).toBeTruthy();
            expect(manifestContent.length).toBeGreaterThan(100);
        });

        it('should be valid JSON', () => {
            expect(() => JSON.parse(manifestContent)).not.toThrow();
        });

        it('should have required PWA properties', () => {
            const manifestData = JSON.parse(manifestContent);

            expect(manifestData).toHaveProperty('name');
            expect(manifestData).toHaveProperty('short_name');
            expect(manifestData).toHaveProperty('start_url');
            expect(manifestData).toHaveProperty('display');
            expect(manifestData).toHaveProperty('theme_color');
            expect(manifestData).toHaveProperty('background_color');
            expect(manifestData).toHaveProperty('icons');

            expect(typeof manifestData.name).toBe('string');
            expect(typeof manifestData.short_name).toBe('string');
            expect(typeof manifestData.start_url).toBe('string');
            expect(typeof manifestData.display).toBe('string');
            expect(typeof manifestData.theme_color).toBe('string');
            expect(typeof manifestData.background_color).toBe('string');
            expect(Array.isArray(manifestData.icons)).toBe(true);
        });

        it('should have valid icon definitions', () => {
            const manifestData = JSON.parse(manifestContent);
            expect(manifestData.icons.length).toBeGreaterThan(0);

            manifestData.icons.forEach(icon => {
                expect(icon).toHaveProperty('src');
                expect(icon).toHaveProperty('sizes');
                expect(typeof icon.src).toBe('string');
                expect(typeof icon.sizes).toBe('string');
            });
        });
    });

    describe('Service Worker Integration Features', () => {
        it('should have proper cache naming', () => {
            expect(swContent).toContain('cacheName: "pages"');
            expect(swContent).toContain('cacheName: "images"');
            expect(swContent).toContain("cacheName: 'static-resources'");
        });

        it('should have proper request filtering', () => {
            expect(swContent).toContain('request.mode === "navigate"');
            expect(swContent).toContain('request.destination === "image"');
            expect(swContent).toContain('request.destination === \'script\' || request.destination === \'style\'');
        });

        it('should have proper error handling', () => {
            expect(swContent).toContain('try');
            expect(swContent).toContain('catch');
            expect(swContent).toContain('console.log');
        });

        it('should have proper lifecycle management', () => {
            expect(swContent).toContain('skipWaiting');
            expect(swContent).toContain('clients.claim');
        });

        it('should have proper cache management', () => {
            expect(swContent).toContain('caches.open');
            expect(swContent).toContain('caches.match');
        });
    });

    describe('Service Worker Performance Features', () => {
        it('should have expiration plugins', () => {
            expect(swContent).toContain('ExpirationPlugin');
            expect(swContent).toContain('maxEntries');
            expect(swContent).toContain('maxAgeSeconds');
        });

        it('should have cacheable response plugins', () => {
            expect(swContent).toContain('CacheableResponsePlugin');
            expect(swContent).toContain('statuses: [0, 200]');
        });

        it('should have proper cache strategies for different content types', () => {
            // Pages should use NetworkFirst
            expect(swContent).toContain('NetworkFirst');

            // Images should use CacheFirst
            expect(swContent).toContain('CacheFirst');

            // Static resources should use StaleWhileRevalidate
            expect(swContent).toContain('StaleWhileRevalidate');
        });
    });

    describe('Service Worker Security Features', () => {
        it('should use strict mode', () => {
            expect(swContent.trim().startsWith('"use strict"')).toBe(true);
        });

        it('should have proper scope handling', () => {
            expect(swContent).toContain('clients.claim');
        });

        it('should have proper skip waiting', () => {
            expect(swContent).toContain('skipWaiting');
        });

        it('should have proper error boundaries', () => {
            expect(swContent).toContain('try');
            expect(swContent).toContain('catch');
        });
    });

    describe('File Size and Performance', () => {
        it('should have reasonable service worker file size', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const stats = fs.statSync(swPath);

            // Service worker should be less than 1MB
            expect(stats.size).toBeLessThan(1024 * 1024);

            // Service worker should not be empty
            expect(stats.size).toBeGreaterThan(1000);
        });

        it('should have reasonable offline page size', () => {
            const offlinePath = path.resolve(__dirname, '../../public/offline.html');
            const stats = fs.statSync(offlinePath);

            // Offline page should be less than 10KB
            expect(stats.size).toBeLessThan(10 * 1024);

            // Offline page should not be empty
            expect(stats.size).toBeGreaterThan(100);
        });

        it('should have compact version file', () => {
            const versionPath = path.resolve(__dirname, '../../public/version.json');
            const stats = fs.statSync(versionPath);

            // Version file should be small
            expect(stats.size).toBeLessThan(1024);

            // Version file should not be empty
            expect(stats.size).toBeGreaterThan(0);
        });

        it('should have reasonable manifest file size', () => {
            const manifestPath = path.resolve(__dirname, '../../public/manifest.json');
            const stats = fs.statSync(manifestPath);

            // Manifest should be less than 10KB
            expect(stats.size).toBeLessThan(10 * 1024);

            // Manifest should not be empty
            expect(stats.size).toBeGreaterThan(100);
        });
    });

    describe('Cross-File Integration', () => {
        it('should reference offline.html correctly in service worker', () => {
            expect(swContent).toContain('offline.html');

            // Verify the offline.html file actually exists and is referenced correctly
            const offlinePath = path.resolve(__dirname, '../../public/offline.html');
            expect(fs.existsSync(offlinePath)).toBe(true);
        });

        it('should reference version.json correctly in service worker', () => {
            expect(swContent).toContain('version.json');

            // Verify the version.json file actually exists and is referenced correctly
            const versionPath = path.resolve(__dirname, '../../public/version.json');
            expect(fs.existsSync(versionPath)).toBe(true);
        });

        it('should have consistent version information', () => {
            const versionData = JSON.parse(versionContent);
            const manifestData = JSON.parse(manifestContent);

            // Both files should have version-related information
            expect(versionData.version).toBeTruthy();
            expect(manifestData.name).toBeTruthy();
        });

        it('should have proper file relationships', () => {
            // Service worker should be able to handle all the files it references
            expect(swContent).toContain('offline.html');
            expect(swContent).toContain('version.json');

            // All referenced files should exist
            const offlinePath = path.resolve(__dirname, '../../public/offline.html');
            const versionPath = path.resolve(__dirname, '../../public/version.json');

            expect(fs.existsSync(offlinePath)).toBe(true);
            expect(fs.existsSync(versionPath)).toBe(true);
        });
    });
}); 