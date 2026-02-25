export function getIconifyFn() {
  return (str) => {
    if (!str) return str;
    const withIcons = str
      .replace(
        /\bpower\b/gi,
        "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>"
      )
      .replace(
        /\bheat\b/gi,
        "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>"
      )
      .replace(
        /\bticks?\b/gi,
        (match) =>
          `${match} <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>`
      )
      .replace(
        /\$(\d+)/g,
        "<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'> $1"
      )
      .replace(/\bEP\b/g, "🧬 $&");

    const numWithUnit = "(?:\\d[\\d,.]*?(?:\\s*[kKmMbBtTqQ])?|\\d[\\d,.]*?(?:e[+\\-]?\\d+)?)";
    const rePower = new RegExp(`(\\b${numWithUnit}\\b)\\s+(power)\\s+(<img[^>]+alt=['\" ]power['\"][^>]*>)`, 'gi');
    const reHeat = new RegExp(`(\\b${numWithUnit}\\b)\\s+(heat)\\s+(<img[^>]+alt=['\" ]heat['\"][^>]*>)`, 'gi');
    const reTick = new RegExp(`(\\b${numWithUnit}\\b)\\s+(ticks?)\\s+(<img[^>]+alt=['\" ]tick['\"][^>]*>)`, 'gi');
    return withIcons
      .replace(rePower, '<span class="num power-num">$1</span> $2 $3')
      .replace(reHeat, '<span class="num heat-num">$1</span> $2 $3')
      .replace(reTick, '<span class="num tick-num">$1</span> $2 $3');
  };
}

export function formatDescriptionBulleted(description, iconifyFn) {
  const raw = String(description || "").trim();
  const cleaned = raw.replace(/\.+$/, '');
  const parts = cleaned
    .split(/\.\s+(?=[A-Z(0-9])/g)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/\.+$/, ''));

  if (parts.length === 0) return '';

  const bullets = parts
    .map(line => `<div class="tooltip-bullet">${iconifyFn(line)}</div>`)
    .join("");

  return bullets;
}

export function colorizeBonus(line, iconifyFn) {
  if (!line) return line;
  let result = line
    .replace(/([+][0-9]+(?:\.[0-9]+)?%?)/g, '<span class="pos">$1</span>')
    .replace(/([-][0-9]+(?:\.[0-9]+)?%?)/g, '<span class="neg">$1</span>')
    .replace(/([+][0-9]+(?:\.[0-9]+)?(?:\/[a-z]+)?)/gi, '<span class="pos">$1</span>')
    .replace(/([-][0-9]+(?:\.[0-9]+)?(?:\/[a-z]+)?)/gi, '<span class="neg">$1</span>');

  result = result.replace(/\b(venting|max heat|transfer|EP heat cap)\b/gi, (m) =>
    iconifyFn(m)
  );

  result = result
    .replace(/\bpower\b/gi, "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>")
    .replace(/(?<!max\s)\bheat\b/gi, "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>")
    .replace(/\bduration\b/gi, "$& <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='time'>");
  return result;
}
