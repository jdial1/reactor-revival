// Only clear ServiceWorker registrations and caches during local development
// This prevents production from continuously unregistering the SW (which breaks PWA detection)
(function () {
    try {
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocalhost) return; // Do nothing in production

        console.log('Dev mode: clearing ServiceWorker registrations and caches...');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                for (let registration of registrations) {
                    registration.unregister();
                    console.log('Service Worker unregistered');
                }
            });
            if ('caches' in window) {
                caches.keys().then(function (cacheNames) {
                    return Promise.all(cacheNames.map(function (cacheName) {
                        console.log('Deleting cache:', cacheName);
                        return caches.delete(cacheName);
                    }));
                }).then(function () {
                    console.log('All caches cleared');
                });
            }
        }
    } catch (e) {
        console.warn('SW clear script error:', e);
    }
})();