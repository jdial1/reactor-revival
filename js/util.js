export function numFormat(num, places = null) {
    const cm_names = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
    let pow;
    let fnum;
    const find_exponent = /(([1-9])(\.([0-9]+))?)e\+([0-9]+)/;
    let fmt_parts;
    let floor_num_str;

    if (num === null || typeof num === 'undefined' || Number.isNaN(num)) return '';
    if (num === Infinity || num === -Infinity) return num > 0 ? 'Infinity' : '-Infinity';

    floor_num_str = Math.floor(num).toString();

    if (places !== null) {
        pow = Math.floor((floor_num_str.length - 1) / 3) * 3;
        // Avoid issues with very small numbers if pow becomes too large for precision
        if (pow > 0) {
             num = Math.round(num / Math.pow(10, pow - places)) * Math.pow(10, pow - places);
        } else {
             num = Math.round(num * Math.pow(10, places)) / Math.pow(10, places);
        }
    }
    
    floor_num_str = Math.floor(num).toString(); // Recalculate after potential rounding

    fmt_parts = floor_num_str.match(find_exponent);

    if (fmt_parts) {
        places = places === null ? 3 : places; // Default places for scientific notation
        const exponentValue = parseInt(fmt_parts[5]);
        if (exponentValue > (cm_names.length + 1) * 3) { // If beyond Dc
            fnum = `${fmt_parts[2]}${fmt_parts[3] ? fmt_parts[3].substring(0, places + 1) : ''}e${fmt_parts[5]}`;
        } else {
            let temp_num_str = fmt_parts[2] + (fmt_parts[4] || '') + '000'; // Ensure enough digits
            const characteristic = parseInt(fmt_parts[5]) % 3;
            const mantissa = parseFloat(
                temp_num_str.substring(0, characteristic + 1) + 
                '.' + 
                temp_num_str.substring(characteristic + 1, characteristic + 1 + places)
            ).toFixed(places);
            fnum = mantissa + (cm_names[Math.floor(exponentValue / 3) - 1] || `e${exponentValue}`);
        }
    } else {
        pow = Math.floor((floor_num_str.length - 1) / 3) * 3;
        if (pow === 0) {
            fnum = (places === null) ? num.toString() : num.toFixed(places);
        } else {
            const val = num / Math.pow(10, pow);
            fnum = (places === null) ? val.toString() : val.toFixed(places || 3);
            fnum += (cm_names[(pow / 3) - 1] || '');
        }
    }
    return fnum;
}

export function timeFormat(ts) {
    ts = Math.round(ts / 1000); // total seconds
    if (ts < 0) ts = 0;

    const s = String(ts % 60).padStart(2, '0');
    ts = Math.floor(ts / 60); // total minutes
    if (ts === 0) return `${s}s`;

    const m = String(ts % 60).padStart(2, '0');
    ts = Math.floor(ts / 60); // total hours
    if (ts === 0) return `${m}m ${s}s`;

    const h = String(ts % 24).padStart(2, '0');
    ts = Math.floor(ts / 24); // total days
    if (ts === 0) return `${h}h ${m}m ${s}s`;

    const d = String(ts);
    return `${d}d ${h}h ${m}m ${s}s`;
}

// Ensure performance.now() is available
window.performance = window.performance || { now: () => new Date().getTime() };

const property_buffer = new Map();

export function addProperty(name, initialValue) {
    if (typeof this === 'undefined' || this === window) {
        console.error("addProperty must be called as a method of an object instance.");
        return;
    }

    this[name] = initialValue;
    this[`${name}Updated`] = true; // Initial state might need update
    this[`${name}Last`] = initialValue; // Keep track of last "committed" value

    const setterName = `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    this[setterName] = (value) => {
        if (value !== this[name]) {
            this[name] = value;
            this[`${name}Updated`] = true;
            
            let updatedSet = property_buffer.get(this);
            if (!updatedSet) {
                updatedSet = new Set();
                property_buffer.set(this, updatedSet);
            }
            updatedSet.add(name);
        }
    };
}

export function updateProperty() { // This function is called by app.ui.js in its update loop
    for (const [instance, updatedProperties] of property_buffer) {
        for (const name of updatedProperties) {
            // The consumer of the *Updated flag is responsible for resetting it
            // This function mainly ensures the *Last value is synced if needed
            // For this system, the main purpose of property_buffer might be to know *what* changed
            // rather than deferring the actual property update.
            // If the value has been "read" and processed by UI, we can sync 'Last'
            // However, the current logic in app.ui seems to handle Updated flags individually.
            // Let's assume this is mostly for notification and the *Updated flags are reset elsewhere.
            instance[`${name}Last`] = instance[name]; // Sync Last to current after changes are processed
        }
    }
    property_buffer.clear();
}

// Event delegation utility
export function on(parentElement, selector, eventType, handler) {
  if (!parentElement) {
    console.warn(`Parent element for delegation is null or undefined. Selector: "${selector}", Event: "${eventType}"`);
    return;
  }
  parentElement.addEventListener(eventType, (event) => {
    const targetElement = event.target.closest(selector);
    if (targetElement && parentElement.contains(targetElement)) {
      handler.call(targetElement, event);
    }
  });
}
