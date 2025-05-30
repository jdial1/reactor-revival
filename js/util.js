export function numFormat(num, places = null) {
    const cm_names = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
    if (num === null || typeof num === 'undefined' || Number.isNaN(num)) return '';
    if (num === Infinity || num === -Infinity) return num > 0 ? 'Infinity' : '-Infinity';

    if (places === null || typeof places === 'undefined') places = 1;

    const absNum = Math.abs(num);

    if (absNum >= 1e15) {
        const exponent = Math.floor(Math.log10(absNum));
        const mantissa = (num / Math.pow(10, exponent)).toFixed(places);
        return `${mantissa}e+${exponent}`;
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
    mantissa = Number(mantissa.toFixed(places));
    let mantissaStr = mantissa.toFixed(places).replace(/\.0+$|(\.\d*?[1-9])0+$/, '$1');
    return mantissaStr + suffix;
}

export function timeFormat(ts) {
    if (ts < 0) ts = 0;

    var s = String(Math.round(ts / 1000)).padStart(2, '0');
    var m = String(Math.floor(s / 60))   .padStart(2, '0');
    var h = String(Math.floor(m / 60))   .padStart(2, '0');
    var d = String(Math.floor(h / 24))   .padStart(2, '0');

    if (s <= 0) return `${s}s`;
    if (m <= 0) return `${m}m ${s}s`;
    if (h <= 0) return `${h}h ${m}m ${s}s`;
    if (d <= 0) return `${d}d ${h}h ${m}m ${s}s`;

    return `${d}d ${h}h ${m}m ${s}s`;
}


export const performance = { now: () => new Date().getTime() };

const property_buffer = new Map();

export function addProperty(name, initialValue) {
    if (typeof this === 'undefined' || this === window) {
        console.error("addProperty must be called as a method of an object instance.");
        return;
    }

    this[name] = initialValue;
    this[`${name}Updated`] = true; 
    this[`${name}Last`] = initialValue;

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

export function updateProperty() {
    for (const [instance, updatedProperties] of property_buffer) {
        for (const name of updatedProperties) {
            instance[`${name}Last`] = instance[name]; 
        }
    }
    property_buffer.clear();
}

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
