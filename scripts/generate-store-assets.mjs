import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const rootDirectory = path.resolve(import.meta.dirname, '..');
const brandDirectory = path.join(rootDirectory, 'assets', 'brand');
const storeDirectory = path.join(rootDirectory, 'assets', 'store');
const iconsDirectory = path.join(rootDirectory, 'icons');
const markSource = await fs.readFile(path.join(brandDirectory, 'kickoff-dial.svg'), 'utf8');
const popupTemplate = await fs.readFile(path.join(rootDirectory, 'popup.html'), 'utf8');
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

const captureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'timbers-store-captures-'));

try {
  const captures = await capturePopupStates(captureDirectory);
  const assets = [
    ['promo-small-440x280.png', 440, 280, promoSmall()],
    ['promo-marquee-1400x560.png', 1400, 560, promoMarquee(captures.next)],
    ['screenshot-01-next-match-1280x800.png', 1280, 800, screenshotPage({
      eyebrow: 'NEXT MATCH',
      headline: ['One click', 'to kickoff.'],
      description: ['Opponent, venue, viewing details,', 'and a live countdown in your toolbar.'],
      capture: captures.next,
    })],
    ['screenshot-02-confidence-1280x800.png', 1280, 800, screenshotPage({
      eyebrow: 'FAN CONFIDENCE',
      headline: ['Share the', 'matchday mood.'],
      description: ['Choose a confidence level and see', 'the community result at a glance.'],
      capture: captures.confidence,
    })],
    ['screenshot-03-viewing-1280x800.png', 1280, 800, screenshotPage({
      eyebrow: 'MATCH DETAILS',
      headline: ['Know where', 'to watch.'],
      description: ['Kickoff time, venue, and available', 'broadcast information stay together.'],
      capture: captures.viewing,
    })],
    ['screenshot-04-resilient-1280x800.png', 1280, 800, screenshotPage({
      eyebrow: 'RELIABLE BY DESIGN',
      headline: ['Useful when', 'the network is not.'],
      description: ['Recent match data remains available', 'with a clear delayed-data notice.'],
      capture: captures.resilient,
    })],
    ['screenshot-05-privacy-1280x800.png', 1280, 800, screenshotPage({
      eyebrow: 'YOUR CONTROL',
      headline: ['Privacy in', 'plain language.'],
      description: ['Anonymous installation identity, clear', 'poll disclosure, and a deletion control.'],
      capture: captures.privacy,
    })],
  ];

  for (const [filename, width, height, content] of assets) {
    await renderSvg(svgDocument(width, height, content), path.join(storeDirectory, filename), width, height);
    process.stdout.write(`assets/store/${filename}\n`);
  }
} finally {
  await fs.rm(captureDirectory, { recursive: true, force: true });
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

function promoMarquee(capture) {
  return `<rect width="1400" height="560" fill="url(#night)"/>
    <rect width="1400" height="560" fill="url(#glow)"/>
    ${orbitPattern(1400, 560)}
    ${mark(72, 165, 170)}
    <text x="278" y="228" fill="${colors.chalk}" font-size="76" class="display">TIMBERS MATCHDAY</text>
    <text x="282" y="294" fill="${colors.gold}" font-size="34" font-weight="700">Your next match. One click away.</text>
    <text x="282" y="354" fill="${colors.mist}" font-size="18" class="utility">INDEPENDENT FAN PROJECT</text>
    ${popupCapture(1033, 39, 0.86, capture)}`;
}

function screenshotPage({ eyebrow, headline, description, capture }) {
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
    ${popupCapture(819, 145, 0.98, capture)}`;
}

function popupCapture(x, y, scale, capture) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" filter="url(#shadow)">
    <rect width="380" height="560" rx="14" fill="${colors.ink}"/>
    <clipPath id="popup-clip"><rect width="380" height="560" rx="14"/></clipPath>
    <image width="380" height="560" href="data:image/png;base64,${capture}" clip-path="url(#popup-clip)"/>
  </g>`;
}

async function capturePopupStates(outputDirectory) {
  const chromeExecutable = await findChromeExecutable();
  const fixedNow = Date.UTC(2026, 7, 4, 18, 45, 0);
  const matchTimestamp = fixedNow + 32 * 60 * 60 * 1000 + 45 * 60 * 1000;
  const aggregate = { high: 68, medium: 23, low: 9 };
  const baseMatch = {
    opponent: 'Seattle Sounders',
    date: 'Saturday, August 8',
    time: '7:30 PM PT',
    location: 'Providence Park',
    tv: 'Apple TV',
    matchTimestamp,
  };
  const fixtures = {
    next: { match: baseMatch, source: 'live', aggregate, hasVoted: false, hasSession: false },
    confidence: { match: baseMatch, source: 'live', aggregate, hasVoted: true, hasSession: true, captureTop: 180 },
    viewing: { match: { ...baseMatch, tv: 'Apple TV · MLS' }, source: 'live', aggregate, hasVoted: false, hasSession: false },
    resilient: { match: baseMatch, source: 'cache', aggregate, hasVoted: false, hasSession: false },
    privacy: { match: baseMatch, source: 'live', aggregate, hasVoted: false, hasSession: true, captureTop: 180 },
  };

  const captures = {};
  for (const [name, fixture] of Object.entries(fixtures)) {
    const htmlPath = path.join(outputDirectory, `${name}.html`);
    const fullScreenshotPath = path.join(outputDirectory, `${name}-full.png`);
    const screenshotPath = path.join(outputDirectory, `${name}.png`);
    await fs.writeFile(htmlPath, buildCaptureHtml({ ...fixture, fixedNow, matchTimestamp }), 'utf8');
    await execFileAsync(chromeExecutable, [
      '--headless=new',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--no-first-run',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      `--screenshot=${fullScreenshotPath}`,
      '--virtual-time-budget=1500',
      '--window-size=380,1000',
      pathToFileURL(htmlPath).href,
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });
    await sharp(fullScreenshotPath)
      .extract({ left: 0, top: fixture.captureTop || 0, width: 380, height: 560 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(screenshotPath);
    const metadata = await sharp(screenshotPath).metadata();
    if (metadata.width !== 380 || metadata.height !== 560) {
      throw new Error(`Runtime capture ${name} must be 380x560.`);
    }
    captures[name] = (await fs.readFile(screenshotPath)).toString('base64');
    process.stdout.write(`runtime-capture/${name}.png\n`);
  }
  return captures;
}

function buildCaptureHtml(fixture) {
  const baseUrl = pathToFileURL(`${rootDirectory}${path.sep}`).href;
  const fixtureJson = JSON.stringify(fixture).replaceAll('<', '\\u003c');
  const captureSetup = `<base href="${baseUrl}">
    <style>* { animation-duration: 0s !important; transition-duration: 0s !important; } html, body { width: 380px; min-height: 1000px; } body { max-height: none !important; overflow: visible !important; }</style>
    <script>
      const fixture = ${fixtureJson};
      const storage = fixture.hasVoted
        ? { [\`hasVoted_\${fixture.matchTimestamp}\`]: true, [\`votes_\${fixture.matchTimestamp}\`]: fixture.aggregate }
        : {};
      Date.now = () => fixture.fixedNow;
      Object.assign(globalThis.chrome ??= {}, {
        runtime: {
          lastError: null,
          sendMessage(_message, callback) {
            queueMicrotask(() => callback({ matchData: fixture.match, source: fixture.source }));
          },
        },
        storage: {
          local: {
            get(keys, callback) {
              const requested = Array.isArray(keys) ? keys : [keys];
              callback(Object.fromEntries(requested.filter((key) => key in storage).map((key) => [key, storage[key]])));
            },
            set(values, callback) {
              Object.assign(storage, values);
              callback?.();
            },
          },
        },
      });
      globalThis.MatchdayAuth = { hasSession: () => Promise.resolve(fixture.hasSession) };
      globalThis.CommunityVotes = {
        get: () => Promise.resolve(fixture.aggregate),
        increment: () => Promise.resolve({ synced: true, aggregate: fixture.aggregate }),
        deleteInstallation: () => Promise.resolve({ deleted: true }),
      };
    </script>`;

  return popupTemplate
    .replace('<head>', `<head>${captureSetup}`)
    .replace(/\s*<script src="runtime-config\.js"><\/script>[\s\S]*?<script src="popup\.js"><\/script>/, '\n  <script src="popup.js"></script>');
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('Chrome or Chromium is required for runtime store captures. Set CHROME_BIN to its executable path.');
}

async function renderSvg(source, outputPath, width, height) {
  await sharp(Buffer.from(source))
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}
