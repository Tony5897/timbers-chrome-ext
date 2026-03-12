/* telemetry.js — GA4 Measurement Protocol helper
 * Config is read from globalThis.TIMBERS_TELEMETRY_CONFIG (set by telemetry.local.js).
 * All calls are silent no-ops if config is absent or incomplete.
 * Never throws — telemetry failures must not affect extension behavior.
 */
(function () {
  const ENDPOINT = 'https://www.google-analytics.com/mp/collect';

  function cfg() {
    return (typeof globalThis !== 'undefined' && globalThis.TIMBERS_TELEMETRY_CONFIG) || null;
  }

  // Persistent client_id — created once per browser profile, stored in chrome.storage.local
  let _clientId = null;
  function clientId() {
    if (_clientId) return Promise.resolve(_clientId);
    return new Promise((resolve) => {
      chrome.storage.local.get('_tc_cid', (res) => {
        if (res._tc_cid) {
          _clientId = res._tc_cid;
          resolve(_clientId);
        } else {
          _clientId = crypto.randomUUID();
          chrome.storage.local.set({ _tc_cid: _clientId });
          resolve(_clientId);
        }
      });
    });
  }

  // Session ID — unique per popup open / service worker startup
  const _sid = Date.now().toString();

  async function sendEvent(name, params) {
    const config = cfg();
    if (!config || !config.measurementId || !config.apiSecret) return;

    let cid;
    try { cid = await clientId(); } catch (_) { return; }

    const url =
      ENDPOINT +
      '?measurement_id=' + encodeURIComponent(config.measurementId) +
      '&api_secret=' + encodeURIComponent(config.apiSecret);

    try {
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          client_id: cid,
          events: [{
            name,
            params: { session_id: _sid, engagement_time_msec: 1, ...params },
          }],
        }),
      });
    } catch (_) { /* never break the extension */ }
  }

  const telemetry = { sendEvent };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = telemetry;
  } else {
    globalThis.Telemetry = telemetry;
  }
})();
