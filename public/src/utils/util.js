export function numFormat(num, places = null) {
    const cm_names = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

    // Handle null, undefined, and NaN inputs
    if (num === null || typeof num === 'undefined') return '';

    // Convert to number and handle NaN
    num = Number(num);
    if (Number.isNaN(num)) return '';

    if (num === Infinity || num === -Infinity) return num > 0 ? 'Infinity' : '-Infinity';
    
    const absNum = Math.abs(num);

    if (places === null) {
        places = absNum >= 1000 ? 2 : 0;
    }
    if (absNum >= 1e36) {
        let expStr = num.toExponential(places);
        expStr = expStr.replace(/\.0+e/, 'e');
        return expStr;
    }

    let pow = 0;
    if (absNum >= 1000) {
        pow = Math.floor(Math.log10(absNum) / 3) * 3;
    }

    let mantissa = num;
    let suffix = '';
    if (pow > 0) {
        mantissa = num / Math.pow(10, pow);
        suffix = cm_names[(pow / 3) - 1] || '';
    }

    // Ensure mantissa is a number before calling toFixed
    mantissa = Number(mantissa);
    if (Number.isNaN(mantissa)) return '';

    // Don't round - just truncate to the specified number of decimal places
    let mantissaStr = mantissa.toFixed(places);
    
    // Remove trailing zeros after decimal point
    mantissaStr = mantissaStr.replace(/\.(\d*?)0+$/, (match, digits) => {
        return digits ? `.${digits}` : '';
    });

    return mantissaStr + suffix;
}

export function timeFormat(ts) {
    if (ts < 0) ts = 0;
    const s = String(Math.round(ts / 1000) % 60).padStart(2, '0');
    const m = String(Math.floor(ts / (1000 * 60)) % 60).padStart(2, '0');
    const h = String(Math.floor(ts / (1000 * 60 * 60)) % 24).padStart(2, '0');
    const d = String(Math.floor(ts / (1000 * 60 * 60 * 24)));

    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export const on = (parentElement, selector, eventType, handler) => {
    if (!parentElement) return;
    parentElement.addEventListener(eventType, (event) => {
        const targetElement = event.target.closest(selector);
        if (targetElement && parentElement.contains(targetElement)) {
            handler.call(targetElement, event);
        }
    });
};

export const performance = (typeof window !== 'undefined' && window.performance) || { now: () => new Date().getTime() };

/**
 * Get the correct base path for GitHub Pages deployment
 * @returns {string} The base path for the current deployment
 */
export function getBasePath() {
    // In Node.js test environment, return empty string
    if (typeof window === 'undefined' || !window.location) {
        return '';
    }

    // Check if we're on GitHub Pages
    const isGitHubPages = window.location.hostname.includes('github.io');

    if (isGitHubPages) {
        // Extract repository name from path
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts.length > 1 && pathParts[1] ? pathParts[1] : '';
        return repoName ? `/${repoName}` : '';
    }

    // For local development or other deployments
    return '';
}

/**
 * Get the correct URL for a resource, accounting for GitHub Pages base path
 * @param {string} resourcePath - The path to the resource (e.g., 'version.json', '/css/main.css')
 * @returns {string} The full URL to the resource
 */
export function getResourceUrl(resourcePath) {
    const basePath = getBasePath();

    // Ensure resourcePath starts with / if it's an absolute path
    if (resourcePath.startsWith('/')) {
        return `${basePath}${resourcePath}`;
    } else {
        // For relative paths, ensure we have the correct base path
        return `${basePath}/${resourcePath}`;
    }
}