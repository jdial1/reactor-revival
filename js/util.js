export function numFormat(num, places = null) {
    const cm_names = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
    if (num === null || typeof num === 'undefined' || Number.isNaN(num)) return '';
    if (num === Infinity || num === -Infinity) return num > 0 ? 'Infinity' : '-Infinity';
    if (places === null) places = 0; // Changed default to 0 for no decimal places

    const absNum = Math.abs(num);
    if (absNum >= 1e36) {
        return num.toExponential(places);
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

    // Don't round - just truncate to the specified number of decimal places
    const mantissaStr = mantissa.toFixed(places);

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

export const performance = window.performance || { now: () => new Date().getTime() };
