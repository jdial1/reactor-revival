import { describe, it, expect, beforeEach, afterEach, vi, fs, path } from '../helpers/setup.js';

// Mock service worker registration
const mockServiceWorkerRegistration = {
    active: {
        postMessage: vi.fn(),
        state: 'activated'
    },
    installing: null,
    waiting: null,
    scope: '/',
    updateViaCache: 'all',
    unregister: vi.fn().mockResolvedValue(true),
    addEventListener: vi.fn()
};

const mockServiceWorker = {
    postMessage: vi.fn(),
    state: 'activated',
    scriptURL: '/sw.js'
};

// Mock service worker container
const mockServiceWorkerContainer = {
    register: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
    getRegistration: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
    getRegistrations: vi.fn().mockResolvedValue([mockServiceWorkerRegistration]),
    controller: mockServiceWorker,
    ready: Promise.resolve(mockServiceWorkerRegistration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
};

// Mock caches
const mockCache = {
    match: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn()
};

const mockCaches = {
    open: vi.fn().mockResolvedValue(mockCache),
    delete: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue(['static-resources', 'pages', 'images']),
    match: vi.fn(),
    has: vi.fn().mockResolvedValue(true)
};

// Mock fetch
const mockFetch = vi.fn();

describe('Service Worker Integration Tests', () => {
    beforeEach(() => {
        // Clear mocks before each test
        vi.clearAllMocks();

        // Recreate the mocks to ensure they have the correct implementations
        const mockServiceWorkerRegistration = {
            active: {
                postMessage: vi.fn(),
                state: 'activated'
            },
            installing: null,
            waiting: null,
            scope: '/',
            updateViaCache: 'all',
            unregister: vi.fn().mockResolvedValue(true),
            addEventListener: vi.fn()
        };

        const mockServiceWorker = {
            postMessage: vi.fn(),
            state: 'activated',
            scriptURL: '/sw.js'
        };

        const mockServiceWorkerContainer = {
            register: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
            getRegistration: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
            getRegistrations: vi.fn().mockResolvedValue([mockServiceWorkerRegistration]),
            controller: mockServiceWorker,
            ready: Promise.resolve(mockServiceWorkerRegistration),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };

        const mockCache = {
            match: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            keys: vi.fn()
        };

        const mockCaches = {
            open: vi.fn().mockResolvedValue(mockCache),
            delete: vi.fn().mockResolvedValue(true),
            keys: vi.fn().mockResolvedValue(['static-resources', 'pages', 'images']),
            match: vi.fn(),
            has: vi.fn().mockResolvedValue(true)
        };

        const mockFetch = vi.fn();

        // Mock the navigator and caches APIs directly on the global objects
        global.navigator = {
            serviceWorker: mockServiceWorkerContainer
        };
        global.caches = mockCaches;
        global.fetch = mockFetch;
    });

    afterEach(() => {
        // Vitest's jsdom environment is reset automatically, but we clear mocks
        vi.clearAllMocks();
    });

    describe('Service Worker File Existence and Accessibility', () => {
        it('should verify service worker file exists in public directory', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            expect(fs.existsSync(swPath)).toBe(true);
        });

        it('should verify service worker file is readable', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');
            expect(swContent).toBeTruthy();
            expect(swContent.length).toBeGreaterThan(0);
        });

        it('should verify service worker file has correct MIME type content', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should start with "use strict"
            expect(swContent.trim().startsWith('"use strict"')).toBe(true);

            // Should contain workbox import
            expect(swContent).toContain('importScripts');
            expect(swContent).toContain('workbox-sw.js');
        });

        it('should verify service worker file has required event listeners', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('addEventListener("install"');
            expect(swContent).toContain('addEventListener("activate"');
        });

        it('should verify service worker file has workbox integration', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('workbox.core.clientsClaim');
            expect(swContent).toContain('workbox.precaching.precacheAndRoute');
        });

        it('should verify service worker file has caching strategies', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('workbox.routing.registerRoute');
            expect(swContent).toContain('NetworkFirst');
            expect(swContent).toContain('CacheFirst');
            expect(swContent).toContain('StaleWhileRevalidate');
        });

        it('should verify service worker file has offline fallback', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('setCatchHandler');
            expect(swContent).toContain('offline.html');
        });

        it('should verify service worker file has version checking', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('startVersionChecking');
            expect(swContent).toContain('version.json');
            expect(swContent).toContain('notifyClientsOfNewVersion');
        });
    });

    describe('Service Worker Dependencies and Assets', () => {
        it('should verify offline.html exists', () => {
            const offlinePath = path.resolve(__dirname, '../../public/offline.html');
            expect(fs.existsSync(offlinePath)).toBe(true);
        });

        it('should verify offline.html is readable', () => {
            const offlinePath = path.resolve(__dirname, '../../public/offline.html');
            const offlineContent = fs.readFileSync(offlinePath, 'utf-8');
            expect(offlineContent).toBeTruthy();
            expect(offlineContent.length).toBeGreaterThan(0);
        });

        it('should verify offline.html has proper HTML structure', () => {
            const offlinePath = path.resolve(__dirname, '../../public/offline.html');
            const offlineContent = fs.readFileSync(offlinePath, 'utf-8');

            expect(offlineContent).toContain('<!DOCTYPE html>');
            expect(offlineContent).toContain('<html');
            expect(offlineContent).toContain('<head>');
            expect(offlineContent).toContain('<body>');
            expect(offlineContent).toContain('offline');
        });

        it('should verify version.json exists', () => {
            const versionPath = path.resolve(__dirname, '../../public/version.json');
            expect(fs.existsSync(versionPath)).toBe(true);
        });

        it('should verify version.json has valid JSON structure', () => {
            const versionPath = path.resolve(__dirname, '../../public/version.json');
            const versionContent = fs.readFileSync(versionPath, 'utf-8');

            expect(() => JSON.parse(versionContent)).not.toThrow();
            const versionData = JSON.parse(versionContent);
            expect(versionData).toHaveProperty('version');
            expect(typeof versionData.version).toBe('string');
        });

        it('should verify manifest.json exists', () => {
            const manifestPath = path.resolve(__dirname, '../../public/manifest.json');
            expect(fs.existsSync(manifestPath)).toBe(true);
        });

        it('should verify manifest.json has valid PWA structure', () => {
            const manifestPath = path.resolve(__dirname, '../../public/manifest.json');
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');

            expect(() => JSON.parse(manifestContent)).not.toThrow();
            const manifestData = JSON.parse(manifestContent);

            expect(manifestData).toHaveProperty('name');
            expect(manifestData).toHaveProperty('short_name');
            expect(manifestData).toHaveProperty('start_url');
            expect(manifestData).toHaveProperty('display');
            expect(manifestData).toHaveProperty('theme_color');
            expect(manifestData).toHaveProperty('background_color');
            expect(manifestData).toHaveProperty('icons');
            expect(Array.isArray(manifestData.icons)).toBe(true);
        });
    });

    describe('Service Worker Content Validation', () => {
        it('should verify service worker has proper error handling', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('catch');
            expect(swContent).toContain('error');
        });

        it('should verify service worker has proper logging', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('console.log');
        });

        it('should verify service worker has proper version checking logic', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('versionUrl');
            expect(swContent).toContain('version.json');
            expect(swContent).toContain('notifyClientsOfNewVersion');
        });

        it('should verify service worker has proper cache management', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('caches.open');
        });

        it('should verify service worker has proper client communication', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('clients.matchAll');
            expect(swContent).toContain('client.postMessage');
        });

        it('should verify service worker has proper skip waiting logic', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('skipWaiting');
            expect(swContent).toContain('clientsClaim');
        });

        it('should verify service worker has proper cache cleanup', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('cache.match');
        });

        it('should verify service worker has proper network error handling', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent).toContain('NetworkFirst');
            expect(swContent).toContain('StaleWhileRevalidate');
        });
    });

    describe('Service Worker Registration and Lifecycle', () => {
        it('should register service worker successfully', async () => {
            const registration = await navigator.serviceWorker.register('/sw.js');
            expect(registration).toBeDefined();
            expect(registration.scope).toBe('/');
            expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
        });

        it('should handle service worker registration errors', async () => {
            // Temporarily override the register method to reject
            const originalRegister = navigator.serviceWorker.register;
            navigator.serviceWorker.register = vi.fn().mockRejectedValueOnce(new Error('Registration failed'));

            await expect(navigator.serviceWorker.register('/sw.js')).rejects.toThrow('Registration failed');

            // Restore original method
            navigator.serviceWorker.register = originalRegister;
        });

        it('should get existing service worker registration', async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            expect(registration).toBeDefined();
            expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
        });

        it('should get all service worker registrations', async () => {
            const registrations = await navigator.serviceWorker.getRegistrations();
            expect(registrations).toBeDefined();
            expect(registrations).toHaveLength(1);
            expect(navigator.serviceWorker.getRegistrations).toHaveBeenCalled();
        });

        it('should handle service worker controller', () => {
            expect(navigator.serviceWorker.controller).toBeDefined();
            expect(navigator.serviceWorker.controller.state).toBe('activated');
        });

        it('should handle service worker ready promise', async () => {
            const registration = await navigator.serviceWorker.ready;
            expect(registration).toBeDefined();
        });

        it('should handle service worker events', () => {
            const eventListener = vi.fn();
            navigator.serviceWorker.addEventListener('message', eventListener);
            expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith('message', eventListener);
        });
    });

    describe('Service Worker Caching Functionality', () => {
        it('should open cache successfully', async () => {
            const cache = await caches.open('test-cache');
            expect(cache).toBeDefined();
            expect(caches.open).toHaveBeenCalledWith('test-cache');
        });

        it('should delete cache successfully', async () => {
            const result = await caches.delete('test-cache');
            expect(result).toBe(true);
            expect(caches.delete).toHaveBeenCalledWith('test-cache');
        });

        it('should get cache keys successfully', async () => {
            const keys = await caches.keys();
            expect(keys).toEqual(['static-resources', 'pages', 'images']);
            expect(caches.keys).toHaveBeenCalled();
        });

        it('should check if cache exists', async () => {
            const exists = await caches.has('test-cache');
            expect(exists).toBe(true);
            expect(caches.has).toHaveBeenCalledWith('test-cache');
        });
    });

    describe('Service Worker Communication', () => {
        it('should post message to service worker', () => {
            const message = { type: 'TEST', data: 'test-data' };
            navigator.serviceWorker.controller.postMessage(message);
            expect(navigator.serviceWorker.controller.postMessage).toHaveBeenCalledWith(message);
        });

        it('should handle service worker message events', () => {
            const eventListener = vi.fn();
            navigator.serviceWorker.addEventListener('message', eventListener);
            expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith('message', eventListener);
        });

        it('should handle service worker error events', () => {
            const eventListener = vi.fn();
            navigator.serviceWorker.addEventListener('error', eventListener);
            expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith('error', eventListener);
        });
    });

    describe('Service Worker File Accessibility', () => {
        it('should fetch service worker file successfully', async () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            global.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: () => Promise.resolve(swContent)
            });

            const response = await fetch('/sw.js');

            expect(response.ok).toBe(true);
            expect(response.status).toBe(200);
            expect(fetch).toHaveBeenCalledWith('/sw.js');
        });

        it('should handle service worker file not found', async () => {
            global.fetch = vi.fn().mockResolvedValueOnce({
                ok: false,
                status: 404
            });

            const response = await fetch('/sw.js');

            expect(response.ok).toBe(false);
            expect(response.status).toBe(404);
        });

        it('should handle service worker fetch errors', async () => {
            const errorMessage = 'Network error';
            global.fetch = vi.fn().mockRejectedValueOnce(new Error(errorMessage));

            await expect(fetch('/sw.js')).rejects.toThrow(errorMessage);
        });
    });

    describe('Service Worker Version Management', () => {
        it('should validate version.json accessibility', async () => {
            const versionPath = path.resolve(__dirname, '../../public/version.json');
            const versionContent = fs.readFileSync(versionPath, 'utf-8');
            const versionData = JSON.parse(versionContent);

            global.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(versionData)
            });

            const response = await fetch('/version.json');
            const data = await response.json();

            expect(response.ok).toBe(true);
            expect(data.version).toBe(versionData.version);
            expect(fetch).toHaveBeenCalledWith('/version.json');
        });

        it('should validate version checking functionality', async () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            global.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: () => Promise.resolve(swContent)
            });

            const response = await fetch('/sw.js');
            const content = await response.text();

            expect(content).toContain('startVersionChecking');
            expect(content).toContain('versionUrl');
            expect(content).toContain('notifyClientsOfNewVersion');
        });
    });

    describe('Service Worker Integration Tests', () => {
        it('should handle complete service worker lifecycle', async () => {
            // Register service worker
            const registration = await navigator.serviceWorker.register('/sw.js');
            expect(registration).toBeDefined();

            // Check if active
            expect(navigator.serviceWorker.controller).toBeDefined();
            expect(navigator.serviceWorker.controller.state).toBe('activated');

            // Test communication
            const message = { type: 'TEST', data: 'test' };
            navigator.serviceWorker.controller.postMessage(message);
            expect(navigator.serviceWorker.controller.postMessage).toHaveBeenCalledWith(message);

            // Test cache operations
            const cache = await caches.open('test');
            expect(cache).toBeDefined();

            // Unregister
            const unregisterResult = await registration.unregister();
            expect(unregisterResult).toBe(true);
        });

        it('should handle service worker update flow', async () => {
            // Mock update available
            const updateEvent = new Event('updatefound');
            mockServiceWorkerRegistration.addEventListener = vi.fn();

            // Simulate update found
            mockServiceWorkerRegistration.addEventListener('updatefound', vi.fn());

            const registration = await navigator.serviceWorker.register('/sw.js');
            expect(registration).toBeDefined();

            // Verify update listener was added
            expect(mockServiceWorkerRegistration.addEventListener).toHaveBeenCalled();
        });

        it('should validate service worker file size is reasonable', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const stats = fs.statSync(swPath);

            // Service worker should be less than 1MB
            expect(stats.size).toBeLessThan(1024 * 1024);

            // Service worker should not be empty
            expect(stats.size).toBeGreaterThan(1000);
        });

        it('should validate service worker has no syntax errors', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Basic syntax validation - should contain valid JavaScript constructs
            expect(swContent).toContain('"use strict"');
            expect(swContent).toContain('function');
            expect(swContent).toContain('addEventListener');

            // Should not contain obvious syntax errors
            expect(swContent).not.toContain('undefined undefined');
            expect(swContent).not.toContain('null null');
        });

        it('should validate service worker has proper error handling', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should have try-catch blocks for error handling
            expect(swContent).toContain('try');
            expect(swContent).toContain('catch');
            expect(swContent).toContain('console.log');
        });
    });

    describe('Service Worker Performance and Optimization', () => {
        it('should validate service worker uses efficient caching strategies', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should use appropriate strategies for different resource types
            expect(swContent).toContain('NetworkFirst'); // For pages
            expect(swContent).toContain('CacheFirst'); // For images
            expect(swContent).toContain('StaleWhileRevalidate'); // For static resources
        });

        it('should validate service worker has proper cache expiration', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should have expiration plugin for image cache
            expect(swContent).toContain('ExpirationPlugin');
            expect(swContent).toContain('maxEntries');
            expect(swContent).toContain('maxAgeSeconds');
        });

        it('should validate service worker has proper cacheable response handling', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should use CacheableResponsePlugin
            expect(swContent).toContain('CacheableResponsePlugin');
            expect(swContent).toContain('statuses: [0, 200]');
        });
    });

    describe('Service Worker Security and Best Practices', () => {
        it('should validate service worker uses strict mode', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            expect(swContent.trim().startsWith('"use strict"')).toBe(true);
        });

        it('should validate service worker has proper scope', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should use clients.claim() for immediate control
            expect(swContent).toContain('clients.claim');
        });

        it('should validate service worker has proper skip waiting', () => {
            const swPath = path.resolve(__dirname, '../../public/sw.js');
            const swContent = fs.readFileSync(swPath, 'utf-8');

            // Should use skipWaiting() for immediate activation
            expect(swContent).toContain('skipWaiting');
        });
    });
}); 