import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const brandDirectory = path.join(rootDirectory, 'assets', 'brand');
const storeDirectory = path.join(rootDirectory, 'assets', 'store');
const iconsDirectory = path.join(rootDirectory, 'icons');
const markSource = await fs.readFile(path.join(brandDirectory, 'kickoff-dial.svg'), 'utf8');
const markBody = markSource.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];

if (!markBody) throw new Error('Unable to read kickoff dial mark.');

const colors = {
  ink: '#071A16',
  fir: '#0E342B',
  pitch: '#125544',
  mint: '#4DE2A8',
  gold: '#F4C95D',
  chalk: '#F7F9F5',
  mist: '#B8C9C2',
  cloud: '#E8EFEC',
  browser: '#F2F6F4',
};

await fs.mkdir(storeDirectory, { recursive: true });
await fs.mkdir(iconsDirectory, { recursive: true });

await Promise.all([
  renderSvg(markSource, path.join(rootDirectory, 'icon.png'), 640, 640),
  ...[16, 48, 128].map((size) => renderSvg(markSource, path.join(iconsDirectory, `icon-${size}.png`), size, size)),
]);

const assets = [
  ['promo-small-440x280.png', 440, 280, promoSmall()],
  ['promo-marquee-1400x560.png', 1400, 560, promoMarquee()],
  ['screenshot-01-next-match-1280x800.png', 1280, 800, screenshotPage({
    eyebrow: 'NEXT MATCH',
    headline: ['One click', 'to kickoff.'],
    description: ['Opponent, venue, viewing details,', 'and a live countdown in your toolbar.'],
    variant: 'next',
  })],
  ['screenshot-02-confidence-1280x800.png', 1280, 800, screenshotPage({
    eyebrow: 'FAN CONFIDENCE',
    headline: ['Share the', 'matchday mood.'],
    description: ['Choose a confidence level and see', 'the community result at a glance.'],
    variant: 'confidence',
  })],
  ['screenshot-03-viewing-1280x800.png', 1280, 800, screenshotPage({
    eyebrow: 'MATCH DETAILS',
    headline: ['Know where', 'to watch.'],
    description: ['Kickoff time, venue, and available', 'broadcast information stay together.'],
    variant: 'viewing',
  })],
  ['screenshot-04-resilient-1280x800.png', 1280, 800, screenshotPage({
    eyebrow: 'RELIABLE BY DESIGN',
    headline: ['Useful when', 'the network is not.'],
    description: ['Recent match data remains available', 'with a clear delayed-data notice.'],
    variant: 'resilient',
  })],
  ['screenshot-05-privacy-1280x800.png', 1280, 800, screenshotPage({
    eyebrow: 'YOUR CONTROL',
    headline: ['Private by', 'plain language.'],
    description: ['Anonymous installation identity, clear', 'poll disclosure, and a deletion control.'],
    variant: 'privacy',
  })],
];

for (const [filename, width, height, content] of assets) {
  await renderSvg(svgDocument(width, height, content), path.join(storeDirectory, filename), width, height);
  process.stdout.write(`assets/store/${filename}\n`);
}

function svgDocument(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors.ink}"/>
        <stop offset="0.55" stop-color="${colors.fir}"/>
        <stop offset="1" stop-color="${colors.pitch}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.82" cy="0.18" r="0.7">
        <stop offset="0" stop-color="${colors.mint}" stop-opacity="0.26"/>
        <stop offset="1" stop-color="${colors.mint}" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#00100C" flood-opacity="0.42"/>
      </filter>
      <style>
        text { font-family: Arial, Helvetica, sans-serif; }
        .utility { font-weight: 700; letter-spacing: 0.18em; }
        .display { font-weight: 800; letter-spacing: -0.035em; }
      </style>
    </defs>
    ${content}
  </svg>`;
}

function mark(x, y, size) {
  return `<g transform="translate(${x} ${y}) scale(${size / 128})">${markBody}</g>`;
}

function orbitPattern(width, height) {
  return `<g fill="none" stroke="${colors.mint}" stroke-opacity="0.09">
    <circle cx="${width * 0.84}" cy="${height * 0.1}" r="${height * 0.62}" stroke-width="22"/>
    <circle cx="${width * 0.84}" cy="${height * 0.1}" r="${height * 0.42}" stroke-width="10"/>
    <path d="M${width * 0.08} ${height * 0.88}H${width * 0.92}" stroke="${colors.gold}" stroke-width="3"/>
  </g>`;
}

function promoSmall() {
  return `<rect width="440" height="280" fill="url(#night)"/>
    <rect width="440" height="280" fill="url(#glow)"/>
    ${orbitPattern(440, 280)}
    ${mark(34, 48, 92)}
    <text x="152" y="112" fill="${colors.chalk}" font-size="42" class="display">TIMBERS</text>
    <text x="152" y="154" fill="${colors.gold}" font-size="31" class="display">MATCHDAY</text>
    <text x="36" y="230" fill="${colors.mist}" font-size="14" class="utility">MATCHDAY, AT A GLANCE</text>`;
}

function promoMarquee() {
  return `<rect width="1400" height="560" fill="url(#night)"/>
    <rect width="1400" height="560" fill="url(#glow)"/>
    ${orbitPattern(1400, 560)}
    ${mark(72, 165, 170)}
    <text x="278" y="228" fill="${colors.chalk}" font-size="76" class="display">TIMBERS MATCHDAY</text>
    <text x="282" y="294" fill="${colors.gold}" font-size="34" font-weight="700">Your next match. One click away.</text>
    <text x="282" y="354" fill="${colors.mist}" font-size="18" class="utility">INDEPENDENT FAN PROJECT</text>
    ${popup(960, 42, 0.86, 'next')}`;
}

function screenshotPage({ eyebrow, headline, description, variant }) {
  return `<rect width="1280" height="800" fill="url(#night)"/>
    <rect width="1280" height="800" fill="url(#glow)"/>
    ${orbitPattern(1280, 800)}
    <rect x="52" y="42" width="1176" height="716" rx="24" fill="${colors.browser}" filter="url(#shadow)"/>
    <path d="M76 42H1204Q1228 42 1228 66V118H52V66Q52 42 76 42Z" fill="${colors.cloud}"/>
    <circle cx="86" cy="80" r="8" fill="#F16C63"/>
    <circle cx="112" cy="80" r="8" fill="${colors.gold}"/>
    <circle cx="138" cy="80" r="8" fill="${colors.mint}"/>
    <rect x="188" y="62" width="610" height="36" rx="18" fill="${colors.chalk}"/>
    <circle cx="214" cy="80" r="8" fill="none" stroke="${colors.mist}" stroke-width="3"/>
    <path d="M220 86L227 93" stroke="${colors.mist}" stroke-width="3" stroke-linecap="round"/>
    <text x="244" y="86" fill="#597069" font-size="15">Matchday in your browser toolbar</text>
    ${mark(1128, 57, 46)}
    <text x="102" y="210" fill="${colors.pitch}" font-size="16" class="utility">${eyebrow}</text>
    <text x="98" y="300" fill="${colors.ink}" font-size="66" class="display">${headline[0]}</text>
    <text x="98" y="366" fill="${colors.ink}" font-size="66" class="display">${headline[1]}</text>
    <rect x="102" y="404" width="92" height="7" rx="3.5" fill="${colors.gold}"/>
    <text x="102" y="468" fill="#466058" font-size="23">${description[0]}</text>
    <text x="102" y="502" fill="#466058" font-size="23">${description[1]}</text>
    <text x="102" y="666" fill="#668078" font-size="14" class="utility">TIMBERS MATCHDAY · INDEPENDENT FAN PROJECT</text>
    ${popup(800, 140, 0.98, variant)}`;
}

function popup(x, y, scale, variant) {
  const body = popupBody(variant);
  return `<g transform="translate(${x} ${y}) scale(${scale})" filter="url(#shadow)">
    <rect width="380" height="560" rx="18" fill="${colors.ink}"/>
    <path d="M18 0H362Q380 0 380 18V64H0V18Q0 0 18 0Z" fill="${colors.fir}"/>
    <rect y="61" width="380" height="3" fill="${colors.mint}"/>
    ${mark(14, 10, 44)}
    <text x="68" y="31" fill="${colors.gold}" font-size="14" font-weight="800" letter-spacing="1.5">PORTLAND TIMBERS</text>
    <text x="68" y="49" fill="${colors.mist}" font-size="11" class="utility">MATCHDAY</text>
    ${body}
    <text x="190" y="543" fill="${colors.mist}" font-size="10" text-anchor="middle" letter-spacing="1.2">INDEPENDENT FAN PROJECT</text>
  </g>`;
}

function card(y, height, title, content, accent = colors.gold) {
  return `<rect x="12" y="${y}" width="356" height="${height}" rx="12" fill="${colors.fir}"/>
    <rect x="12" y="${y}" width="356" height="4" rx="2" fill="${accent}"/>
    <text x="28" y="${y + 28}" fill="${accent}" font-size="10" class="utility">${title}</text>
    ${content}`;
}

function popupBody(variant) {
  if (variant === 'confidence') {
    return `${card(78, 76, 'NEXT MATCH', `
      <text x="28" y="128" fill="${colors.chalk}" font-size="16" font-weight="800">PORTLAND vs SEATTLE</text>
      <text x="352" y="128" fill="${colors.mist}" font-size="12" text-anchor="end">SAT · 7:30 PM</text>`)}
      ${card(166, 350, 'CONFIDENCE POLL', `
        <text x="28" y="214" fill="${colors.chalk}" font-size="14" font-weight="700">How confident are you in today’s result?</text>
        ${pollRow(28, 250, 'HIGH', 68, colors.mint)}
        ${pollRow(28, 302, 'MEDIUM', 23, colors.gold)}
        ${pollRow(28, 354, 'LOW', 9, colors.mist)}
        <text x="28" y="414" fill="${colors.mist}" font-size="11">Community totals update after your vote.</text>
        <rect x="28" y="438" width="324" height="50" rx="9" fill="${colors.pitch}"/>
        <text x="190" y="469" fill="${colors.chalk}" font-size="13" font-weight="800" text-anchor="middle">YOUR VOTE: HIGH</text>`)} `;
  }

  if (variant === 'viewing') {
    return `${card(78, 304, 'NEXT MATCH', `
      <text x="190" y="135" fill="${colors.gold}" font-size="15" font-weight="800" text-anchor="middle">PORTLAND TIMBERS</text>
      <circle cx="190" cy="166" r="18" fill="${colors.pitch}"/>
      <text x="190" y="171" fill="${colors.mist}" font-size="9" font-weight="800" text-anchor="middle">VS</text>
      <text x="190" y="208" fill="${colors.chalk}" font-size="15" font-weight="800" text-anchor="middle">SEATTLE</text>
      ${detailCell(28, 236, 'KICKOFF', '7:30 PM PT')}
      ${detailCell(198, 236, 'VENUE', 'LUMEN FIELD')}
      ${detailCell(28, 304, 'WATCH', 'APPLE TV')}
      ${detailCell(198, 304, 'COMPETITION', 'MLS')}`)}
      ${card(396, 120, 'KICKOFF IN', `
        <text x="190" y="466" fill="${colors.chalk}" font-size="34" font-weight="800" text-anchor="middle">1d 08h 45m</text>
        <text x="190" y="494" fill="${colors.mist}" font-size="11" text-anchor="middle">Updated automatically</text>`, colors.mint)}`;
  }

  if (variant === 'resilient') {
    return `${card(78, 332, 'NEXT MATCH', `
      <rect x="28" y="116" width="324" height="42" rx="8" fill="#173F35" stroke="${colors.gold}" stroke-opacity="0.45"/>
      <text x="190" y="142" fill="${colors.gold}" font-size="11" font-weight="700" text-anchor="middle">SCHEDULE DATA MAY BE DELAYED</text>
      <text x="190" y="205" fill="${colors.gold}" font-size="15" font-weight="800" text-anchor="middle">PORTLAND vs SEATTLE</text>
      <text x="190" y="236" fill="${colors.chalk}" font-size="13" text-anchor="middle">Saturday · 7:30 PM PT</text>
      <text x="190" y="264" fill="${colors.mist}" font-size="12" text-anchor="middle">Last confirmed match information</text>
      <rect x="28" y="294" width="324" height="86" rx="10" fill="${colors.ink}"/>
      <text x="190" y="327" fill="${colors.mint}" font-size="10" class="utility" text-anchor="middle">CACHED LOCALLY</text>
      <text x="190" y="357" fill="${colors.chalk}" font-size="16" font-weight="800" text-anchor="middle">1d 08h 45m</text>`)}
      ${card(424, 92, 'RELIABILITY', `
        <text x="28" y="472" fill="${colors.chalk}" font-size="12">Live source → recent cache → bundled fallback</text>
        <text x="28" y="496" fill="${colors.mist}" font-size="11">No blank matchday screen.</text>`, colors.mint)}`;
  }

  if (variant === 'privacy') {
    return `${card(78, 438, 'CONFIDENCE POLL', `
      <text x="28" y="126" fill="${colors.chalk}" font-size="14" font-weight="700">How confident are you in today’s result?</text>
      <text x="28" y="154" fill="${colors.mist}" font-size="11">Your choice is tied to an anonymous installation</text>
      <text x="28" y="172" fill="${colors.mist}" font-size="11">and contributes to public community totals.</text>
      <rect x="28" y="198" width="96" height="58" rx="9" fill="${colors.pitch}"/>
      <rect x="136" y="198" width="96" height="58" rx="9" fill="#173F35"/>
      <rect x="244" y="198" width="96" height="58" rx="9" fill="#173F35"/>
      <text x="76" y="233" fill="${colors.chalk}" font-size="12" font-weight="800" text-anchor="middle">HIGH</text>
      <text x="184" y="233" fill="${colors.chalk}" font-size="12" font-weight="800" text-anchor="middle">MED</text>
      <text x="292" y="233" fill="${colors.chalk}" font-size="12" font-weight="800" text-anchor="middle">LOW</text>
      <text x="28" y="302" fill="${colors.mint}" font-size="10" class="utility">YOUR DATA, YOUR CONTROL</text>
      <text x="28" y="334" fill="${colors.chalk}" font-size="12">Poll responses use an anonymous account.</text>
      <text x="28" y="356" fill="${colors.chalk}" font-size="12">No name or email is required.</text>
      <rect x="28" y="386" width="324" height="54" rx="9" fill="none" stroke="${colors.mist}" stroke-opacity="0.65"/>
      <text x="190" y="419" fill="${colors.chalk}" font-size="12" font-weight="700" text-anchor="middle">DELETE MY COMMUNITY DATA</text>
      <text x="190" y="474" fill="${colors.mist}" font-size="10" text-anchor="middle">Public totals do not verify a unique person.</text>`)} `;
  }

  return `${card(78, 304, 'NEXT MATCH', `
    <text x="190" y="132" fill="${colors.gold}" font-size="15" font-weight="800" text-anchor="middle">PORTLAND TIMBERS</text>
    <circle cx="190" cy="162" r="18" fill="${colors.pitch}"/>
    <text x="190" y="167" fill="${colors.mist}" font-size="9" font-weight="800" text-anchor="middle">VS</text>
    <text x="190" y="202" fill="${colors.chalk}" font-size="15" font-weight="800" text-anchor="middle">SEATTLE</text>
    <text x="190" y="242" fill="${colors.mist}" font-size="11" text-anchor="middle">SATURDAY · 7:30 PM PT · LUMEN FIELD</text>
    <rect x="28" y="270" width="324" height="82" rx="10" fill="${colors.ink}"/>
    <text x="190" y="297" fill="${colors.mint}" font-size="10" class="utility" text-anchor="middle">KICKOFF IN</text>
    <text x="190" y="334" fill="${colors.chalk}" font-size="28" font-weight="800" text-anchor="middle">1d 08h 45m</text>`)}
    ${card(396, 120, 'CONFIDENCE POLL', `
      <text x="28" y="448" fill="${colors.chalk}" font-size="13" font-weight="700">How are you feeling about this one?</text>
      <text x="28" y="478" fill="${colors.mint}" font-size="12" font-weight="800">HIGH</text>
      <text x="190" y="478" fill="${colors.gold}" font-size="12" font-weight="800">MEDIUM</text>
      <text x="352" y="478" fill="${colors.mist}" font-size="12" font-weight="800" text-anchor="end">LOW</text>`, colors.mint)}`;
}

function pollRow(x, y, label, percentage, fill) {
  const width = Math.round(324 * (percentage / 100));
  return `<text x="${x}" y="${y}" fill="${colors.chalk}" font-size="11" font-weight="800">${label}</text>
    <text x="352" y="${y}" fill="${fill}" font-size="11" font-weight="800" text-anchor="end">${percentage}%</text>
    <rect x="${x}" y="${y + 10}" width="324" height="10" rx="5" fill="${colors.ink}"/>
    <rect x="${x}" y="${y + 10}" width="${width}" height="10" rx="5" fill="${fill}"/>`;
}

function detailCell(x, y, label, value) {
  return `<rect x="${x}" y="${y}" width="154" height="54" rx="8" fill="${colors.ink}"/>
    <text x="${x + 77}" y="${y + 19}" fill="${colors.mist}" font-size="9" class="utility" text-anchor="middle">${label}</text>
    <text x="${x + 77}" y="${y + 40}" fill="${colors.chalk}" font-size="11" font-weight="800" text-anchor="middle">${value}</text>`;
}

async function renderSvg(source, outputPath, width, height) {
  await sharp(Buffer.from(source))
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}
