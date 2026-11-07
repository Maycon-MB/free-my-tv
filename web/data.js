/*
 * What the home screen shows, kept in localStorage so it opens with numbers:
 *  - the picks: what's trending this week and recent releases, only from the streaming apps on this TV (TMDB, with
 *    the person's own free key from config.properties), 3 per hour (up to 6 in Home Settings);
 *  - weather, sunrise and sunset (Open-Meteo, every 30 min) and optional crypto prices (Binance, every 5 min).
 * Settings changed on the TV (Prefs) win over config.properties, as on Android. Built without a city (--generic), the
 * TV's time zone gives the city, and its country the currency and the region (zones.js).
 */
var CONFIG = window.CONFIG || {};

/**
 * Weekday and month names for formatDate on TVs without Intl (strings.js), here where translate.py finds them.
 * "months" is the form next to a day ("28 октября"), as the catalogues' patterns use it.
 */
I18N.dateNames = function (kind) {
  if (kind === 'months') {
    return [tr('monthday|January'), tr('monthday|February'), tr('monthday|March'), tr('monthday|April'),
      tr('monthday|May'), tr('monthday|June'), tr('monthday|July'), tr('monthday|August'), tr('monthday|September'),
      tr('monthday|October'), tr('monthday|November'), tr('monthday|December')];
  }
  if (kind === 'shortMonths') {
    return [tr('month|Jan'), tr('month|Feb'), tr('month|Mar'), tr('month|Apr'), tr('month|May'), tr('month|Jun'),
      tr('month|Jul'), tr('month|Aug'), tr('month|Sep'), tr('month|Oct'), tr('month|Nov'), tr('month|Dec')];
  }
  if (kind === 'weekdays') {
    return [tr('weekday|Sunday'), tr('weekday|Monday'), tr('weekday|Tuesday'), tr('weekday|Wednesday'),
      tr('weekday|Thursday'), tr('weekday|Friday'), tr('weekday|Saturday')];
  }
  return [tr('weekday|Sun'), tr('weekday|Mon'), tr('weekday|Tue'), tr('weekday|Wed'), tr('weekday|Thu'),
    tr('weekday|Fri'), tr('weekday|Sat')];
};

var Place = (function () {
  'use strict';
  var EURO = /^(AT|BE|BG|CY|DE|EE|ES|FI|FR|GR|HR|IE|IT|LT|LU|LV|MT|NL|PT|SI|SK)$/;

  /** A time zone's main city: {country, lat, lon, name}, or null. */
  function zone(name) {
    var all = window.ZONES || {}, v = all[name], hops = 0;
    while (v && v.charAt(0) === '=' && hops++ < 3) { name = v.slice(1); v = all[name]; }
    if (!v) return null;
    var p = v.split(',');
    return {country: p[0], lat: p[1], lon: p[2], name: p[3] || name.slice(name.lastIndexOf('/') + 1).replace(/_/g, ' ')};
  }

  var tz = zone(TV.zone()), set = CONFIG.latitude !== '' && CONFIG.latitude !== undefined;
  var country = (CONFIG.tmdbRegion || (tz ? tz.country : '') || 'US').toUpperCase();
  return {
    lat: set ? CONFIG.latitude : tz ? tz.lat : '40.7128',
    lon: set ? CONFIG.longitude : tz ? tz.lon : '-74.0060',
    city: CONFIG.city || (!set && tz ? tz.name : ''),
    country: country,
    currency: (CONFIG.currency || (country === 'BR' ? 'BRL' : EURO.test(country) ? 'EUR' : 'USD')).toUpperCase(),
    /** Fahrenheit for TVs in the US (by their time zone, or their language when it doesn't tell). */
    fahrenheit: tz ? tz.country === 'US' : /-US$/i.test(navigator.language || '')
  };
})();

var Prefs = (function () {
  'use strict';
  var KEY = 'fmtv.prefs';
  var v = {};
  try { v = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  var savedListeners = [];
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    for (var i = 0; i < savedListeners.length; i++) savedListeners[i]();
  }
  function pick(name, fallback) { return v[name] === undefined ? fallback : v[name]; }
  return {
    version: 0,
    language: function () { return pick('language', CONFIG.language || 'auto'); },
    temperature: function () { return pick('temperature', CONFIG.temperature || 'auto'); },
    theme: function () { return pick('theme', CONFIG.theme || 'auto'); },
    weather: function () { return pick('weather', true); },
    /** OK on the screensaver opens the title it shows, in its app; any other key only closes it (off by default). */
    saverWatch: function () { return pick('saverWatch', false) === true; },
    /** What the screensaver shows: 'photos' (the picks' photos, as it always has) or 'clock' (a clock and the weather). */
    saver: function () { return pick('saver', 'photos') === 'clock' ? 'clock' : 'photos'; },
    /** Dimming over the picture, for a dark room: 'off', 'low', 'medium', 'high' or 'auto' (medium at night). */
    dim: function () { return pick('dim', 'off'); },
    /** The weather card's forecast: 'hours' (the next 6 hours) or 'days' (the next 5 days). */
    forecast: function () { return pick('forecast', 'hours') === 'days' ? 'days' : 'hours'; },
    quotes: function () { return pick('quotes', CONFIG.showCrypto !== false); },
    coin: function (i) { var c = pick('coins', null); return c ? c[i] !== false : true; },
    /** Picks per tab: 3 (as it was) up to 6. */
    cards: function () { var n = pick('cards', 12); return n < 8 ? 8 : n > 14 ? 14 : n; },
    /** Cartoons and anime out of the picks (Home Settings), or config.properties' hide_animation. */
    hideAnimation: function () { return pick('hideAnimation', CONFIG.hideAnimation === true) === true; },
    shelf: function () { return pick('shelf', null); },
    /** The shelf_apps of the build that last set the shelf, so a new one wins once over the TV's choice. */
    shelfConfig: function () { return pick('shelfConfig', ''); },
    /** The weather's city, picked on the TV (Home Settings → City), or config.properties' (or the time zone's). */
    city: function () { return pick('city', Place.city); },
    latitude: function () { return pick('latitude', Place.lat); },
    longitude: function () { return pick('longitude', Place.lon); },
    /** The TMDB key typed on the TV (Home Settings → TMDB key), or config.properties' ('' for none). */
    tmdbKey: function () { return String(pick('tmdbKey', CONFIG.tmdbKey || '')).trim(); },
    /** True when the key in use was typed on the TV (Remove takes it back to config.properties'). */
    tmdbKeyOnTV: function () { return v.tmdbKey !== undefined; },
    setCity: function (name, lat, lon) { v.city = name; v.latitude = lat; v.longitude = lon; save(); this.version++; },
    /** Streaming services (keys like "netflix") whose titles are left out of the picks. */
    serviceOff: function (key) { return pick('servicesOff', []).indexOf(key) >= 0; },
    setServiceOff: function (key, off) {
      var list = pick('servicesOff', []).filter(function (k) { return k !== key; });
      if (off) list.push(key);
      this.set('servicesOff', list);
    },
    openPicks: function () { return pick('openPicks', CONFIG.openPicksIn === 'nuvio' ? 'nuvio' : 'apps'); },
    set: function (name, value) { v[name] = value; save(); this.version++; },
    /** fn() after every saved change (the backup listens). */
    onSave: function (fn) { savedListeners.push(fn); },
    /** Everything the person set, as stored: what the backup keeps. */
    dump: function () { return JSON.stringify(v); },
    get: function (name, fallback) { return pick(name, fallback); },
    setCoin: function (i, on) {
      var c = (pick('coins', null) || [true, true, true, true]).slice();
      c[i] = on;
      this.set('coins', c);
    }
  };
})();

var Data = (function () {
  'use strict';

  function store(key, value) { try { localStorage.setItem('fmtv.' + key, JSON.stringify(value)); } catch (e) {} }
  function stored(key) { try { return JSON.parse(localStorage.getItem('fmtv.' + key)); } catch (e) { return null; } }

  /** GET a JSON document; done(error, json). */
  function get(url, headers, done) {
    var x = new XMLHttpRequest();
    var over = false;
    x.open('GET', url, true);
    x.timeout = 10000;
    for (var h in headers) if (headers.hasOwnProperty(h)) x.setRequestHeader(h, headers[h]);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) { done(new Error(x.status === 401 ? 'TMDB rejected the key' : 'HTTP ' + x.status)); return; }
      var json;
      try { json = JSON.parse(x.responseText); } catch (e) { done(e); return; }
      done(null, json);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done(new Error('no connection')); } };
    x.send();
  }

  /**
   * Open-Meteo, over plain http where https fails: its certificate chains to Let's Encrypt's ISRG root, which 2015 and
   * 2016 TVs (Tizen 2.3 and 2.4) don't trust. Only the city's coordinates and the forecast go in the clear. Each call
   * tries https first, so a newer TV whose request once timed out doesn't stay on http.
   */
  function getMeteo(path, done) {
    get('https://' + path, {}, function (err, body) {
      // A certificate the TV doesn't trust ends as a network error: status 0, or onerror.
      if (err && /^(no connection|HTTP 0)$/.test(err.message)) {
        get('http://' + path, {}, done);
        return;
      }
      done(err, body);
    });
  }

  var listeners = [];
  function changed() { for (var i = 0; i < listeners.length; i++) listeners[i](); }

  // MARK: - Weather

  function place() { return Prefs.latitude() + ',' + Prefs.longitude(); }
  // Both forecasts in one answer, the next 48 hours and today plus 5 days: Home Settings → Forecast switches without
  // asking again, and offline too.
  var QUERY = '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code'
      + '&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=6&forecast_hours=48';
  var weather = null, weatherAt = 0, fetchingWeather = false;
  (function () {
    var w = stored('weather');
    // Fetched with another query (an older version): shown, and fetched again now.
    if (w && w.place === place()) { weather = parseWeather(w.body); weatherAt = w.query === QUERY ? w.at : 0; }
  })();

  /** "2026-10-20T18:31" at the location (Open-Meteo's local time) → epoch ms. */
  function localTime(iso, offsetSeconds) {
    var m = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(iso || '');
    if (!m) return 0;
    return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) - offsetSeconds * 1000;
  }

  function parseWeather(o) {
    if (!o || !o.current) return null;
    var off = o.utc_offset_seconds || 0, dl = o.daily, now = Date.now();
    var w = {
      temp: o.current.temperature_2m, code: o.current.weather_code, isDay: o.current.is_day !== 0,
      max: dl.temperature_2m_max[0], min: dl.temperature_2m_min[0],
      sunrise: localTime(dl.sunrise[0], off), sunset: localTime(dl.sunset[0], off), hours: [], days: []
    };
    var hr = o.hourly;
    for (var i = 0; hr && i < hr.time.length && w.hours.length < 6; i++) {
      var at = localTime(hr.time[i], off);
      if (at <= now) continue;
      w.hours.push({at: at, temp: hr.temperature_2m[i], code: hr.weather_code[i], day: !hr.is_day || hr.is_day[i] !== 0});
    }
    // The next 5 days, from tomorrow (none in a forecast cached before the days). Only days that haven't started at
    // the city: today, and past days in a forecast cached offline, are left out.
    for (var j = 0; dl.weather_code && j < dl.time.length && w.days.length < 5; j++) {
      if (localTime(dl.time[j] + 'T12:00', off) - 12 * 3600000 <= now) continue;
      var p = dl.time[j].split('-');   // named by its noon on the TV's clock, right even with the city far away
      w.days.push({at: new Date(+p[0], p[1] - 1, +p[2], 12).getTime(), max: dl.temperature_2m_max[j],
        min: dl.temperature_2m_min[j], code: dl.weather_code[j]});
    }
    return w;
  }

  function refreshWeather() {
    var now = Date.now();
    if (fetchingWeather || (now - weatherAt < 30 * 60000 && now >= weatherAt)) return;
    fetchingWeather = true;
    var at = place();
    getMeteo('api.open-meteo.com/v1/forecast?latitude=' + Prefs.latitude() + '&longitude=' + Prefs.longitude() + QUERY, function (err, body) {
      fetchingWeather = false;
      if (at !== place()) { refreshWeather(); return; }   // another city was picked meanwhile
      if (err) return;
      weather = parseWeather(body);
      weatherAt = Date.now();
      store('weather', {place: at, body: body, at: weatherAt, query: QUERY});
      changed();
    });
  }

  /** Places with this name (Open-Meteo, in the app's language): done(error, [{label, city, lat, lon}]). */
  function findCity(name, done) {
    var lang = I18N.lang.replace(/-.*/, '');   // Open-Meteo takes the language without the country
    getMeteo('geocoding-api.open-meteo.com/v1/search?count=10&format=json&language=' + lang + '&name='
        + encodeURIComponent(name.trim()), function (err, body) {
      if (err) { done(err); return; }
      var results = (body && body.results) || [], out = [], seen = {};
      for (var i = 0; i < results.length; i++) {
        var r = results[i], city = r.name || '';
        if (!city || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
        var label = city, parts = [r.admin1, r.country];
        for (var j = 0; j < parts.length; j++) if (parts[j] && parts[j] !== city) label += ', ' + parts[j];
        if (seen['#' + label]) continue;   // places with the same name, state and country read the same
        seen['#' + label] = true;
        out.push({label: label, city: city, lat: r.latitude.toFixed(4), lon: r.longitude.toFixed(4)});
      }
      done(null, out);
    });
  }

  // MARK: - Prices

  var COINS = ['BTC', 'ETH', 'SOL', 'USDT'];
  var CURRENCY = Place.currency;
  var QUOTE = CURRENCY === 'USD' ? 'USDT' : CURRENCY;
  /** Binance refuses the whole request when it has no pairs in the currency (INR...): the prices go in dollars then. */
  function inDollars() {
    store('dollarsFor', CURRENCY);
    CURRENCY = 'USD';
    QUOTE = 'USDT';
  }
  /** A pair with no trade for a day: Binance halted it and keeps answering with the frozen last price (AUD since 2026-10-06). */
  function halted(list) {
    for (var i = 0; list && i < list.length; i++) if (list[i].closeTime > 0 && Date.now() - list[i].closeTime > 864e5) return true;
    return false;
  }
  if (stored('dollarsFor') === CURRENCY && CURRENCY !== 'USD') {
    CURRENCY = 'USD';
    QUOTE = 'USDT';
  }
  var prices = [NaN, NaN, NaN, NaN], changes = [NaN, NaN, NaN, NaN], pricesAt = 0, fetchingPrices = false;

  /** Indexes in COINS of the coins that are on (the dollar only in Brazilian reais, where Binance lists it). */
  function activeCoins() {
    var out = [];
    if (!Prefs.quotes()) return out;
    for (var i = 0; i < COINS.length; i++) if (Prefs.coin(i) && (i < 3 || CURRENCY === 'BRL')) out.push(i);
    return out;
  }

  function parsePrices(list) {
    var found = 0;
    for (var i = 0; list && i < list.length; i++) {
      for (var k = 0; k < COINS.length; k++) {
        if (list[i].symbol !== COINS[k] + QUOTE) continue;
        found++;
        var last = parseFloat(list[i].lastPrice), open = parseFloat(list[i].openPrice);
        prices[k] = last;
        changes[k] = open > 0 ? (last - open) / open * 100 : NaN;
      }
    }
    return found;
  }

  (function () {
    var p = stored('prices');
    if (p && p.quote === QUOTE && parsePrices(p.body)) pricesAt = p.at;
  })();

  function refreshPrices() {
    var coins = activeCoins(), now = Date.now();
    if (!coins.length || fetchingPrices || (now - pricesAt < 5 * 60000 && now >= pricesAt)) return;
    fetchingPrices = true;
    var symbols = coins.map(function (i) { return '%22' + COINS[i] + QUOTE + '%22'; }).join(',');
    var path = '/api/v3/ticker/24hr?type=MINI&symbols=%5B' + symbols + '%5D';
    // Binance.com refuses the US (HTTP 451); Binance.US answers the same call in dollars. data-api.binance.vision is
    // Binance's own address for public market data, with Binance.com's pairs on another domain and certificate chain:
    // it answers where a network blocks or intercepts api.binance.com (#375). A refusal skips it.
    var hosts = ['https://api.binance.com', 'https://data-api.binance.vision', 'https://api.binance.us'];
    (function next(h, refused) {
      get(hosts[h] + path, {}, function (err, body) {
        // A pair Binance doesn't list (HTTP 400): the prices go in dollars. Binance.US has only dollar pairs: its 400
        // counts only where Binance.com refuses the US (HTTP 451), not after a timeout or a 5xx there.
        if (err && err.message === 'HTTP 400' && QUOTE !== 'USDT' && (h < 2 || refused)) { fetchingPrices = false; inDollars(); refreshPrices(); return; }
        // Halted: dollars for this run, not saved like the 400's (the market may open again).
        if (!err && QUOTE !== 'USDT' && halted(body)) { fetchingPrices = false; CURRENCY = 'USD'; QUOTE = 'USDT'; refreshPrices(); return; }
        if (err || !parsePrices(body)) {
          var refusal = !!err && err.message === 'HTTP 451';
          if (h + 1 < hosts.length && !(err && err.message === 'HTTP 400')) next(refusal ? 2 : h + 1, refused || refusal);
          else fetchingPrices = false;
          return;
        }
        fetchingPrices = false;
        pricesAt = Date.now();
        store('prices', {quote: QUOTE, body: body, at: pricesAt});
        changed();
      });
    })(0);
  }

  // MARK: - Picks (TMDB)

  var KEY = Prefs.tmdbKey();
  var REGION = Place.country;
  var API = 'https://api.tmdb.org/3';   // TMDB's own mirror of api.themoviedb.org: some ISPs block the other name (#327)

  /** Service name on TMDB (part of it, lowercase) → our key, how to find its app on the TV (id, name), its name. */
  var SERVICES = [
    ['netflix', 'netflix', /^netflix$/, /netflix/i, 'Netflix'],
    ['prime video', 'prime', /^amazon$/, /prime video|amazon/i, 'Prime Video'],
    ['disney', 'disney', /disney/, /disney/i, 'Disney+'],
    ['hulu', 'hulu', /^hulu/, /hulu/i, 'Hulu'],
    ['paramount', 'paramount', /paramount|cbs/, /paramount/i, 'Paramount+'],
    ['peacock', 'peacock', /peacock/, /peacock/i, 'Peacock'],
    ['globoplay', 'globoplay', /globoplay/, /globoplay/i, 'Globoplay'],
    ['claro', 'claro', /claro/, /claro/i, 'Claro tv+'],   // TMDB: Claro tv+ (484) and Claro video (167)
    ['pluto', 'pluto', /pluto/, /pluto/i, 'Pluto TV'],   // free with ads: TMDB lists it under "ads"/"free"
    ['mercado play', 'mercadoplay', /mercadoplay/, /mercado ?play/i, 'Mercado Play'],
    ['max', 'max', /hbo|wbd|\.max/, /^(hbo )?max$|hbo max/i, 'Max'],
    ['apple tv', 'appletv', /appletv|apple\.tv/, /apple tv/i, 'Apple TV'],
    ['hotstar', 'hotstar', /hotstar/, /hotstar/i, 'JioHotstar'],
    ['crunchyroll', 'crunchyroll', /crunchyroll/, /crunchyroll/i, 'Crunchyroll'],
    ['now tv', 'now', /nowtv|now\.tv/, /^now( tv)?$/i, 'NOW']
  ];

  var installed = [];   // the TV's apps, from TV.apps()

  /** A service whose app is on the TV and that the person hasn't switched off in Home Settings (Picks from). */
  function usable(key) { return !!appFor(key) && !Prefs.serviceOff(key); }

  /** The streaming services whose app is on this TV, as {key, name}, for Home Settings. */
  function services() {
    var out = [];
    for (var s = 0; s < SERVICES.length; s++) if (appFor(SERVICES[s][1])) out.push({key: SERVICES[s][1], name: SERVICES[s][4]});
    return out;
  }

  /** The installed app for a service key, or null. */
  function appFor(key) {
    for (var s = 0; s < SERVICES.length; s++) {
      if (SERVICES[s][1] !== key) continue;
      for (var i = 0; i < installed.length; i++) {
        if (SERVICES[s][2].test(installed[i].id) || SERVICES[s][3].test(installed[i].title)) return installed[i];
      }
    }
    return null;
  }

  /** "… Amazon Channel" is sold inside another app; Apple TV is only the streaming service (350; 2 is the store). */
  function service(providerName, providerId) {
    var n = (providerName || '').toLowerCase();
    if (n.indexOf(' channel') >= 0) return null;
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i];
      if (s[1] === 'appletv' && providerId !== 350) continue;
      if (s[0] === 'max' ? /\bmax\b/.test(n) : n.indexOf(s[0]) >= 0) return s;
    }
    return null;
  }

  function tmdb(path, done, key) {
    key = key || KEY;
    var bearer = key.indexOf('eyJ') === 0;   // read access token (v4) or API key (v3)
    var url = API + path + (bearer ? '' : (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(key));
    get(url, bearer ? {Authorization: 'Bearer ' + key, Accept: 'application/json'} : {Accept: 'application/json'}, done);
  }

  /** Asks TMDB whether a key works before it's saved: done(error), with error.rejected when TMDB said no. */
  function checkKey(key, done) {
    tmdb('/configuration', function (err) {
      if (err && /rejected/.test(err.message)) err.rejected = true;
      done(err || null);
    }, key);
  }

  var cache = stored('recs') || {};
  var picks = cache.picks || [], listAt = cache.listAt || 0, period = cache.period, listLang = cache.lang || '', stamp = cache.stamp || '';
  var fetchingRecs = false, failedAt = 0, recsError = '';

  function saveRecs() { store('recs', {picks: picks, listAt: listAt, period: period, lang: listLang, stamp: stamp}); }

  function hourPeriod(d) {
    var h = d.getHours();
    return h >= 5 && h < 12 ? 0 : h >= 12 && h < 18 ? 1 : 2;
  }

  function sourceStamp() {
    var s = KEY.length + ':' + KEY.slice(-6) + ':' + REGION + (Prefs.hideAnimation() ? ':no-animation' : '')
      + (Prefs.get('kids', false) ? ':kids' : '');
    for (var i = 0; i < SERVICES.length; i++) s += usable(SERVICES[i][1]) ? '1' : '0';
    return s;
  }

  function franchise(title) {
    var t = (title || '').toLowerCase(), cut = t.indexOf(':');
    if (cut < 0) cut = t.indexOf(' - ');
    return (cut > 0 ? t.slice(0, cut) : t).replace(/^\s+|\s+$/g, '');
  }

  /** This hour's picks (Prefs.cards()): movies ("movie"), shows ("tv") or both (null). */
  function now(kind) {
    var list = [];
    if (!KEY) return list;
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i];
      if ((kind === null || kind === p.kind) && (!p.detailed || (p.app && usable(p.app)))) list.push(p);
    }
    if (!list.length) return list;
    var hour = Math.floor(Date.now() / 3600000), out = [], seen = {}, n = Prefs.cards();
    for (var j = 0; j < list.length && out.length < n; j++) {
      var q = list[(hour * n + j) % list.length], f = franchise(q.title);
      if (!seen[f]) { seen[f] = true; out.push(q); }
    }
    return out;
  }

  /** TMDB's language, as on Android: Latin American Spanish unless the TV is in Spain, and Germany's German. */
  function lang() {
    if (I18N.lang === 'es') return /-ES\b/i.test(navigator.language || '') ? 'es-ES' : 'es-MX';
    if (I18N.lang === 'de') return 'de-DE';   // TMDB's de-AT and de-CH have few translations of their own
    return I18N.locale();
  }

  function day(offset) {
    var d = new Date(Date.now() + offset * 86400000);
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  }

  /** TMDB's genres that it leaves in English in some languages. */
  function genre(name) {
    switch (name) {
      case 'Action & Adventure': return tr('genre|Action & Adventure');
      case 'Sci-Fi & Fantasy': return tr('genre|Sci-Fi & Fantasy');
      case 'War & Politics': return tr('genre|War & Politics');
      case 'Kids': return tr('genre|Kids');
      case 'News': return tr('genre|News');
      case 'Soap': return tr('genre|Soap');
      case 'Talk': return tr('genre|Talk');
      default: return name;
    }
  }

  /** The best backdrop: no text over it, the largest, then the best rated. */
  function bestBackdrop(images) {
    var list = images && images.backdrops, best = null, score = -1;
    for (var i = 0; list && i < list.length; i++) {
      var b = list[i];
      if (!b.file_path) continue;
      var s = (b.iso_639_1 === null ? 1e7 : 0) + Math.min(b.width || 0, 3840) * 100 + (b.vote_average || 0);
      if (s > score) { score = s; best = b.file_path; }
    }
    return best;
  }

  /** Genre, runtime or seasons, and the service it's on among the TV's apps. */
  function details(p, done) {
    tmdb('/' + p.kind + '/' + p.id + '?language=' + lang() + '&append_to_response=watch/providers,images&include_image_language=null,'
        + I18N.base + ',en', function (err, o) {
      if (err) { done(err); return; }
      var best = bestBackdrop(o.images);
      if (best) p.backdrop = best;
      if (o.poster_path) p.poster = o.poster_path;
      if (o.overview) p.overview = o.overview;
      var parts = [];
      if (p.kind === 'tv') parts.push(tr('Series'));
      if (o.genres && o.genres.length) {
        parts.push(genre(o.genres[0].name));
      }
      if (p.kind === 'movie' && o.runtime > 0) {
        var h = Math.floor(o.runtime / 60), m = o.runtime % 60;
        parts.push(h ? trf('{h}h {m}m', {h: h, m: m}) : trf('{m}m', {m: m}));
      } else if (p.kind === 'tv' && o.number_of_seasons > 0) {
        parts.push(plural('plural|one:{n} season|other:{n} seasons', o.number_of_seasons));
      }
      var wp = o['watch/providers'];
      placeTitle(p, wp && wp.results && wp.results[REGION]);
      if (p.app) parts.push(p.service);
      p.meta = parts.join(' · ');
      title(p, o, function () {
        p.detailed = true;
        done(null);
      });
    });
  }

  /**
   * Without a title in the TV's language TMDB answers with the original one, so a Korean series on a German TV reads
   * "닥터X: 하얀 마피아의 시대". Then the English title, when TMDB has one (one more request, only for those).
   */
  function title(p, o, done) {
    var field = p.kind === 'movie' ? 'title' : 'name', own = o[field] || p.title;
    p.title = own;
    if (I18N.lang === 'en' || !own || own !== o['original_' + field] || o.original_language === I18N.base
        || o.original_language === 'en') { done(); return; }
    tmdb('/' + p.kind + '/' + p.id + '?language=en-US', function (err, en) {
      if (!err && en && en[field]) p.title = en[field];
      done();
    });
  }

  /** TMDB's Animation genre (movies and shows: cartoons and anime), left out with Cartoons and anime off. */
  var ANIMATION = 16;

  /** Kids mode keeps only TMDB's Animation, Family and Kids genres. */
  function forFamily(o) {
    for (var i = 0; o.genre_ids && i < o.genre_ids.length; i++) {
      var g = o.genre_ids[i];
      if (g === ANIMATION || g === 10751 || g === 10762) return true;
    }
    return false;
  }

  function animated(o) {
    for (var i = 0; o.genre_ids && i < o.genre_ids.length; i++) if (o.genre_ids[i] === ANIMATION) return true;
    return false;
  }

  function addPick(list, o, kind) {
    if (!o.backdrop_path) return;
    if (Prefs.get('kids', false) ? !forFamily(o) : Prefs.hideAnimation() && animated(o)) return;
    list.push({id: o.id, kind: kind, title: kind === 'movie' ? o.title : o.name, backdrop: o.backdrop_path, poster: o.poster_path || '', meta: '', app: null, detailed: false,
      year: String(o.release_date || o.first_air_date || '').slice(0, 4), overview: o.overview || ''});
  }

  // MARK: - Genres: the picks of one genre, only from the TV's apps (the home screen's chips and Search's)

  // TMDB's ids differ between movies and shows; a genre without a show id (Horror, Romance) brings only movies.
  var GENRES = [{name: 'Tudo'}, {name: 'Comédia', movie: 35, tv: 35}, {name: 'Ação', movie: 28, tv: 10759},
    {name: 'Drama', movie: 18, tv: 18}, {name: 'Terror', movie: 27}, {name: 'Animação', movie: 16, tv: 16},
    {name: 'Crime', movie: 80, tv: 80}, {name: 'Romance', movie: 10749}, {name: 'Documentário', movie: 99, tv: 99},
    {name: 'Família', movie: 10751, tv: 10751}];
  var GENRE_MAX = 14, GENRE_KEEP = 6 * 3600000, GENRE_RETRY = 60000, genreLists = {}, providerIds = null;

  /** TMDB's ids of the services whose app this TV has (and Picks from leaves on). */
  function myProviders(done) {
    if (providerIds && providerIds.stamp === sourceStamp()) { done(providerIds.ids); return; }
    tmdb('/watch/providers/movie?language=' + lang() + '&watch_region=' + REGION, function (err, res) {
      var ids = [];
      for (var i = 0; !err && res.results && i < res.results.length; i++) {
        var s = service(res.results[i].provider_name, res.results[i].provider_id);
        if (s && usable(s[1])) ids.push(res.results[i].provider_id);
      }
      if (!err) providerIds = {stamp: sourceStamp(), ids: ids};
      done(ids);
    });
  }

  function genreKey(kind, g) { return (kind || 'all') + ':' + g.name + ':' + sourceStamp(); }

  /** A genre's list already fetched (in the last 6 hours), or null. */
  function genreNow(kind, g) {
    var hit = genreLists[genreKey(kind, g)];
    return hit && Date.now() - hit.at < (hit.list.length ? GENRE_KEEP : GENRE_RETRY) ? hit.list : null;
  }

  /** done(list): the most popular titles of a genre on the TV's apps, each with where it streams. */
  function byGenre(kind, g, done) {
    var hit = genreNow(kind, g);
    if (hit) { done(hit); return; }
    myProviders(function (ids) {
      if (!ids.length) { genreLists[genreKey(kind, g)] = {at: Date.now(), list: []}; done([]); return; }
      var found = {movie: [], tv: []}, kinds = kind ? [kind] : ['movie', 'tv'];
      each(kinds, function (k, next) {
        if (!g[k]) { next(); return; }
        tmdb('/discover/' + k + '?with_genres=' + g[k] + '&vote_count.gte=' + (k === 'movie' ? 50 : 20) + '&language=' + lang()
            + '&watch_region=' + REGION + '&with_watch_monetization_types=flatrate%7Cfree%7Cads&include_adult=false'
            + '&sort_by=popularity.desc&with_watch_providers=' + encodeURIComponent(ids.join('|')), function (e, r) {
          for (var j = 0; !e && r.results && j < r.results.length; j++) addPick(found[k], r.results[j], k);
          next();
        });
      }, function () {
        var list = [];
        alternate(list, {}, found.movie, found.tv, GENRE_MAX);
        each(list, function (p, next) {
          streamsOn(p, function () {
            p.meta = [p.kind === 'tv' ? tr('Series') : '', g.name, p.service].filter(function (x) { return x; }).join(' · ');
            p.detailed = true;
            next();
          });
        }, function () {
          list = list.filter(function (p) { return p.app; });
          genreLists[genreKey(kind, g)] = {at: Date.now(), list: list};
          done(list);
        });
      });
    });
  }

  function keyOf(p) { return p.kind + ':' + p.id; }

  function alternate(out, seen, a, b, max) {
    for (var i = 0; i < Math.max(a.length, b.length) && out.length < max; i++) {
      if (i < a.length && !seen[keyOf(a[i])]) { seen[keyOf(a[i])] = true; out.push(a[i]); }
      if (i < b.length && out.length < max && !seen[keyOf(b[i])]) { seen[keyOf(b[i])] = true; out.push(b[i]); }
    }
  }

  /** Runs fn on each item one after the other (the TV's network is shared with what's playing). */
  function each(items, fn, done) {
    var i = 0;
    (function next() {
      if (i >= items.length) { done(); return; }
      fn(items[i++], next);
    })();
  }

  function fetchList(done) {
    tmdb('/watch/providers/movie?language=' + lang() + '&watch_region=' + REGION, function (err, res) {
      if (err) { done(err); return; }
      var ids = [];
      for (var i = 0; res.results && i < res.results.length; i++) {
        var s = service(res.results[i].provider_name, res.results[i].provider_id);
        if (s && usable(s[1])) ids.push(res.results[i].provider_id);
      }
      if (!ids.length) { done(new Error("none of the TV's streaming apps are on TMDB (or switched on in Picks from)")); return; }
      var common = '&language=' + lang() + '&watch_region=' + REGION + '&with_watch_monetization_types=flatrate%7Cfree%7Cads&include_adult=false'
          + '&sort_by=popularity.desc&with_watch_providers=' + encodeURIComponent(ids.join('|'))
          + (Prefs.hideAnimation() ? '&without_genres=' + ANIMATION : '');
      var hot = {movie: [], tv: []}, fresh = {movie: [], tv: []};
      each(['movie', 'tv'], function (kind, next) {
        tmdb('/trending/' + kind + '/week?language=' + lang(), function (e, r) {
          var candidates = [];
          for (var j = 0; !e && j < r.results.length && j < 16; j++) addPick(candidates, r.results[j], kind);
          // Trending is only kept when it's on one of the TV's apps: the details say where.
          each(candidates, function (p, n) {
            details(p, function (de) { if (!de && p.app) hot[kind].push(p); n(); });
          }, next);
        });
      }, function () {
        tmdb('/discover/movie?vote_count.gte=30&primary_release_date.gte=' + day(-365) + '&primary_release_date.lte=' + day(0) + common, function (e1, r1) {
          for (var j = 0; !e1 && j < r1.results.length; j++) addPick(fresh.movie, r1.results[j], 'movie');
          tmdb('/discover/tv?vote_count.gte=20&air_date.gte=' + day(-90) + '&air_date.lte=' + day(0) + common, function (e2, r2) {
            for (var k = 0; !e2 && k < r2.results.length; k++) addPick(fresh.tv, r2.results[k], 'tv');
            var list = [], seen = {};
            // What's popular and streaming in this region first, the worldwide trending after it.
            alternate(list, seen, fresh.movie, fresh.tv, 24);
            alternate(list, seen, hot.movie, hot.tv, 24);
            if (!list.length) { done(new Error('TMDB returned no recommendations')); return; }
            picks = list;
            done(null);
          });
        });
      });
    });
  }

  /** Fetches the list when stale (6 h, a new period of the day, language, key or apps), then this hour's details. */
  function refreshRecs() {
    if (!KEY || fetchingRecs || !installed.length) return;
    var t = Date.now(), p = hourPeriod(new Date()), st = sourceStamp();
    if (st === stamp && failedAt && t - failedAt < 10 * 60000 && t >= failedAt) return;
    var stale = st !== stamp || p !== period || t - listAt > 6 * 3600000 || t < listAt || !picks.length || listLang !== I18N.lang;
    var wanted = all(), missing = false;
    for (var i = 0; i < wanted.length; i++) missing = missing || !wanted[i].detailed;
    if (!stale && !missing) return;
    fetchingRecs = true;
    stamp = st;
    function finish(err) {
      fetchingRecs = false;
      if (err) { recsError = err.message; failedAt = Date.now(); } else { recsError = ''; failedAt = 0; }
      saveRecs();
      changed();
    }
    function detailWanted() {
      var todo = all().filter(function (x) { return !x.detailed; });
      each(todo, function (x, next) { details(x, function () { next(); }); }, function () { finish(null); });
    }
    if (stale) {
      fetchList(function (err) {
        if (err) { finish(err); return; }
        listAt = Date.now();
        period = p;
        listLang = I18N.lang;
        detailWanted();
      });
    } else {
      detailWanted();
    }
  }

  /** This hour's picks for the three tabs, without repeats (the screensaver shows them too). */
  function all() {
    var out = [], seen = {}, kinds = [null, 'movie', 'tv'];
    for (var k = 0; k < kinds.length; k++) {
      var list = now(kinds[k]);
      for (var i = 0; i < list.length; i++) if (!seen[keyOf(list[i])]) { seen[keyOf(list[i])] = true; out.push(list[i]); }
    }
    return out;
  }

  // MARK: - Formatting

  function fmt(v, digits) {
    // Old WebKit (Tizen 2) has no Intl: toLocaleString ignores its options and prints every digit, without failing.
    // English separators there; a per-language table if someone asks.
    if (typeof Intl === 'undefined') return v.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    try { return v.toLocaleString(I18N.locale(), {minimumFractionDigits: digits, maximumFractionDigits: digits}); } catch (e) { return v.toFixed(digits); }
  }

  // MARK: - Search: TMDB's titles, each with the service it streams on here and whether the TV has that app

  var genreNames = null, searchSeq = 0;

  /** {id: name} for movie and TV genres, fetched once in the TV's language. */
  function genres(done) {
    if (genreNames) { done(genreNames); return; }
    var names = {}, left = 2, failed = false;
    ['movie', 'tv'].forEach(function (kind) {
      tmdb('/genre/' + kind + '/list?language=' + lang(), function (err, o) {
        failed = failed || !!err;
        for (var i = 0; !err && o && o.genres && i < o.genres.length; i++) names[o.genres[i].id] = o.genres[i].name;
        if (--left === 0) { if (!failed) genreNames = names; done(names); }   // a failure is asked again next search
      });
    });
  }

  /**
   * Where a title streams here, from TMDB's providers for the region: p.apps (services whose app the TV has, the most
   * launched first), p.app and p.service (the first), p.elsewhere (services without the app), p.paid (rent/buy).
   * Subscription, free and free-with-ads all count: Pluto TV and Mercado Play are the last two.
   */
  function placeTitle(p, here) {
    var offers = [].concat((here && here.flatrate) || [], (here && here.free) || [], (here && here.ads) || []);
    var usage = Prefs.get('usage', {}), apps = [], elsewhere = [];
    for (var i = 0; i < offers.length; i++) {
      var s = service(offers[i].provider_name, offers[i].provider_id);
      if (!s) continue;
      if (usable(s[1])) { if (apps.indexOf(s[1]) < 0) apps.push(s[1]); } else if (elsewhere.indexOf(s[4]) < 0) elsewhere.push(s[4]);
    }
    function launches(key) { var a = appFor(key); return a ? usage[a.id] || 0 : 0; }
    apps.sort(function (a, b) { return launches(b) - launches(a); });
    p.apps = apps;
    p.app = apps[0] || null;
    p.service = p.app ? serviceName(p.app) : elsewhere[0] || '';
    p.elsewhere = elsewhere;
    var rent = here && here.rent && here.rent.length, buy = here && here.buy && here.buy.length;
    p.paid = rent && buy ? 'Alugar ou comprar' : rent ? 'Alugar' : buy ? 'Comprar' : '';
  }

  function serviceName(key) {
    for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i][1] === key) return SERVICES[i][4];
    return key;
  }

  function streamsOn(p, done) {
    tmdb('/' + p.kind + '/' + p.id + '/watch/providers', function (err, o) {
      placeTitle(p, !err && o && o.results && o.results[REGION]);
      done();
    });
  }

  var trailers = {}, titleLinks = {};

  // MARK: - Episodes: a series' news for its card, the rule in one place
  // "new": an episode came out in the last 7 days; "soon": one comes in the next 7 days; else nothing.

  var EPISODE_WINDOW = 7 * 86400000, EPISODE_CACHE = 6 * 3600000, episodeNews = {};

  function dayOf(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;   // local midnight: "today" is the TV's day
  }

  /** done(null or {state: 'new' | 'soon', at, season, episode}) for a series, cached for 6 hours. */
  function episodes(p, done) {
    var hit = episodeNews[p.id];
    if (p.kind !== 'tv') { done(null); return; }
    if (hit && Date.now() - hit.at < EPISODE_CACHE) { done(hit.news); return; }
    tmdb('/tv/' + Number(p.id) + '?language=' + lang(), function (err, o) {
      var now = Date.now(), news = null, last = o && o.last_episode_to_air, next = o && o.next_episode_to_air;
      if (!err && next && dayOf(next.air_date) - now < EPISODE_WINDOW && dayOf(next.air_date) >= now - 86400000) {
        news = {state: dayOf(next.air_date) <= now ? 'new' : 'soon', at: dayOf(next.air_date), season: next.season_number,
          episode: next.episode_number};
      } else if (!err && last && now - dayOf(last.air_date) < EPISODE_WINDOW) {
        news = {state: 'new', at: dayOf(last.air_date), season: last.season_number, episode: last.episode_number};
      }
      episodeNews[p.id] = {at: now, news: news};
      done(news);
    });
  }

  /**
   * Services whose webOS app opens a title from launch params: Wikidata id properties and the params. Netflix's form
   * is the community's; Disney+'s is what LG's own search sends it (browse id, P13902), tested on webOS 25. Others
   * open on their home: a web address left Disney+ half-loaded, so no form is guessed.
   */
  var TITLE_LINKS = {
    netflix: [['P1874'], function (id) { return {contentTarget: 'm=https://www.netflix.com/title/' + id + '&source_type=4'}; }],
    disney: [['P13902'], function (id) {
      return /^entity-[\w-]+$/.test(id) ? {handledBy: 'app', contentTarget: 'page=browse&id=' + id + '&distributionPartner=lg'} : null;
    }]
  };

  /** The launch params that open a title in its service's app: done(params or null). */
  function titleLink(p, service, done) {
    var spec = TITLE_LINKS[service], k = service + ':' + keyOf(p);
    // No catalogue has Prime's or Apple TV's ids for Brazil: the TV's service finds them on each one's site.
    if (service === 'prime' || service === 'appletv') {
      if (titleLinks[k] !== undefined) { done(titleLinks[k]); return; }
      TV.service(service === 'prime' ? 'primeId' : 'appleUrl', {title: p.title}, function (res) {
        var target = res && (res.gti || res.url);
        titleLinks[k] = target ? {contentTarget: target} : null;
        done(titleLinks[k]);
      });
      return;
    }
    if (!spec) { done(null); return; }
    if (titleLinks[k] !== undefined) { done(titleLinks[k]); return; }
    var tmdbProp = p.kind === 'tv' ? 'P4983' : 'P4947', alts = [];
    for (var i = 0; i < spec[0].length; i++) alts.push('{ ?i wdt:' + spec[0][i] + ' ?n }');
    var q = 'SELECT ?n WHERE { ?i wdt:' + tmdbProp + ' "' + Number(p.id) + '" . ' + alts.join(' UNION ') + ' } LIMIT 1';
    get('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {Accept: 'application/sparql-results+json'},
        function (err, o) {
      var b = !err && o && o.results && o.results.bindings && o.results.bindings[0];
      var id = b && b.n && /^[\w.:\/-]+$/.test(b.n.value) ? b.n.value : '';
      titleLinks[k] = id ? spec[1](id, p.kind) : null;
      done(titleLinks[k]);
    });
  }

  /** The title's YouTube trailer key: done(key or ''), Portuguese first, official before fan uploads. */
  function trailer(p, done) {
    var k = keyOf(p);
    if (trailers[k] !== undefined) { done(trailers[k]); return; }
    function best(o) {
      var list = (o && o.results) || [], found = '';
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (v.site !== 'YouTube' || (v.type !== 'Trailer' && v.type !== 'Teaser')) continue;
        if (!found || (v.official && v.type === 'Trailer')) found = v.key;
        if (v.official && v.type === 'Trailer') break;
      }
      return found;
    }
    tmdb('/' + p.kind + '/' + p.id + '/videos?language=' + lang(), function (err, o) {
      var key = err ? '' : best(o);
      if (key) { trailers[k] = key; done(key); return; }
      tmdb('/' + p.kind + '/' + p.id + '/videos?language=en-US', function (err2, o2) {
        trailers[k] = err2 ? '' : best(o2);
        done(trailers[k]);
      });
    });
  }

  // Search rules, all here (the screen only shows what comes back):
  // 1. A person ("Tom Hanks") brings their movies and shows; else titles from TMDB's search.
  // 2. Nothing found: tries again without short words, then word by word (typos like "la casa d papel").
  // 3. Order: streaming on the TV's apps first, then closest to what was typed, then popularity; making-ofs and
  //    titles nobody rated go last.
  var SEARCH_MAX = 15, SEARCH_PROVIDERS = 10;
  var EXTRAS = /making of|bastidores|especial|behind the scenes|featurette/i;

  /** Lowercase, without accents or punctuation: "Pokémon: O Filme" -> "pokemon o filme". */
  function plain(text) {
    var s = String(text || '').toLowerCase();
    var from = 'áàâãäéèêëíìîïóòôõöúùûüçñ', to = 'aaaaaeeeeiiiiooooouuuucn';
    for (var i = 0; i < from.length; i++) s = s.split(from.charAt(i)).join(to.charAt(i));
    return s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** How alike two texts are, 0 to 1 (Dice over letter pairs, spaces ignored): survives typos and glued words. */
  function likeness(a, b) {
    a = plain(a).replace(/ /g, '');
    b = plain(b).replace(/ /g, '');
    if (!a || !b) return 0;
    if (a === b) return 1;
    var pairs = {}, total = 0, hits = 0, i, k;
    for (i = 0; i < a.length - 1; i++) { k = a.substr(i, 2); pairs[k] = (pairs[k] || 0) + 1; total++; }
    for (i = 0; i < b.length - 1; i++) { k = b.substr(i, 2); total++; if (pairs[k] > 0) { pairs[k]--; hits++; } }
    return total ? 2 * hits / total : 0;
  }

  /** The queries to try, in order: as typed, without words under 3 letters, then each long word, longest first. */
  function attempts(query) {
    var words = plain(query).split(' '), out = [query], longer = [], i;
    for (i = 0; i < words.length; i++) if (words[i].length >= 3) longer.push(words[i]);
    if (longer.length && longer.join(' ') !== plain(query)) out.push(longer.join(' '));
    longer.sort(function (a, b) { return b.length - a.length; });
    for (i = 0; i < longer.length && i < 2; i++) if (longer[i].length >= 4 && longer.length > 1) out.push(longer[i]);
    // Last: the longest word's first 4 letters ("stranjer tings" -> "stra"); the likeness filter keeps the right one.
    if (longer[0] && longer[0].length >= 6) out.push(longer[0].slice(0, 4));
    return out;
  }

  function asTitle(r, kind, names) {
    return {id: r.id, kind: kind, title: r.title || r.name || '', original: r.original_title || r.original_name || '',
      year: (r.release_date || r.first_air_date || '').slice(0, 4), poster: r.poster_path, backdrop: r.backdrop_path,
      popularity: r.popularity || 0, votes: r.vote_count || 0, app: null, service: '',
      genres: (r.genre_ids || []).map(function (g) { return names[g]; }).filter(function (x) { return x; })};
  }

  /** Higher first: what the TV can play, then the closest name, then popularity; extras and unrated go down. */
  function score(p, query) {
    var near = Math.max(likeness(p.title, query), likeness(p.original, query));
    var s = (p.app && usable(p.app) ? 2 : 0) + near * 1.5 + Math.min(1, Math.log(1 + p.popularity) / 6);
    if (EXTRAS.test(p.title) || p.votes < 3) s -= 1.5;
    return s;
  }

  function rank(list, query) {
    return list.map(function (p, i) { return [p, score(p, query), i]; })
      .sort(function (a, b) { return (b[1] - a[1]) || (a[2] - b[2]); })
      .map(function (x) { return x[0]; });
  }

  // Talk shows, news and reality (TMDB genres): a guest spot there isn't one of the person's works.
  var NOT_WORKS = [10767, 10763, 10764], AS_SELF = /self|himself|herself|ele mesmo|ela mesma/i;

  /** A person's own work: films, series with 3+ episodes, or what they directed or created; best known first. */
  function isWork(c) {
    if ((c.media_type !== 'movie' && c.media_type !== 'tv') || !c.poster_path) return false;
    if (c.job && c.job !== 'Director' && c.job !== 'Creator') return false;
    for (var i = 0; c.genre_ids && i < c.genre_ids.length; i++) if (NOT_WORKS.indexOf(c.genre_ids[i]) >= 0) return false;
    if (AS_SELF.test(c.character || '')) return false;
    return c.media_type === 'movie' || !!c.job || (c.episode_count || 0) >= 3;
  }

  function personTitles(person, names, done) {
    tmdb('/person/' + person.id + '/combined_credits?language=' + lang(), function (err, o) {
      var seen = {}, out = [];
      var all = ((o && o.cast) || []).concat((o && o.crew) || []).filter(isWork);
      all.sort(function (a, b) { return (b.vote_count || 0) - (a.vote_count || 0); });
      for (var i = 0; i < all.length && out.length < SEARCH_MAX; i++) {
        var k = all[i].media_type + ':' + all[i].id;
        if (seen[k]) continue;
        seen[k] = true;
        out.push(asTitle(all[i], all[i].media_type, names));
      }
      done(err, out);
    });
  }

  /**
   * Movies and shows for a query: done(error, [{id, kind, title, year, poster, backdrop, genres, app, service,
   * paid, person}]). Only the newest query answers, so typing on doesn't show an older list.
   */
  function search(query, done) {
    var seq = ++searchSeq, tries = attempts(query);
    if (!KEY) { done(new Error('no key'), []); return; }
    function finish(err, found, person) {
      if (seq !== searchSeq) return;
      if (err && !found.length) { done(err, []); return; }
      found = found.slice(0, SEARCH_MAX);
      var first = found.slice(0, SEARCH_PROVIDERS), left = first.length;
      if (!left) { done(null, found); return; }
      first.forEach(function (p) {
        streamsOn(p, function () {
          if (--left || seq !== searchSeq) return;
          found = person ? found : rank(found, query);
          if (person) for (var i = 0; i < found.length; i++) found[i].person = person;
          done(null, found);
        });
      });
    }
    genres(function (names) {
      (function attempt(n) {
        tmdb('/search/multi?include_adult=false&language=' + lang() + '&query=' + encodeURIComponent(tries[n]),
            function (err, o) {
          if (seq !== searchSeq) return;
          var results = (o && o.results) || [], who = null;
          // A person whose name is what was typed ("Tom Hanks"), even below a documentary with the name in its
          // title; but a title that looks like the query before them wins ("Kill Bill" is also an artist).
          for (var j = 0; j < results.length && j < 6 && !who; j++) {
            var r0 = results[j];
            if (r0.media_type === 'person') { if (likeness(r0.name, query) > 0.85) who = r0; continue; }
            if (likeness(r0.title || r0.name, query) > 0.6 || likeness(r0.original_title || r0.original_name, query) > 0.6) break;
          }
          if (who) {
            personTitles(who, names, function (e, list) { finish(e, list, who.name); });
            return;
          }
          var found = [];
          for (var i = 0; i < results.length; i++) {
            var r = results[i];
            if ((r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path) found.push(asTitle(r, r.media_type, names));
          }
          // A retry with fewer words matches loosely: keep only titles that look like what was typed.
          if (n > 0) found = found.filter(function (p) { return Math.max(likeness(p.title, query), likeness(p.original, query)) > 0.5; });
          if (!found.length && n + 1 < tries.length) { attempt(n + 1); return; }
          finish(err, rank(found, query).slice(0, SEARCH_PROVIDERS + 5), null);
        });
      })(0);
    });
  }

  var SYMBOLS = {USD: '$', BRL: 'R$ ', EUR: '€', GBP: '£', JPY: '¥'};

  return {
    COINS: COINS,
    get city() { return Prefs.city(); },
    currency: CURRENCY,
    onChange: function (fn) { listeners.push(fn); },
    setApps: function (apps) { installed = apps; },
    appFor: appFor,
    usable: usable,
    search: search,
    titleLink: titleLink,
    GENRES: GENRES,
    byGenre: byGenre,
    genreNow: genreNow,
    trailer: trailer,
    episodes: episodes,
    serviceName: serviceName,
    services: services,
    refresh: function () { refreshWeather(); refreshPrices(); refreshRecs(); },
    settingsChanged: function () { pricesAt = 0; refreshPrices(); changed(); },
    findCity: findCity,
    /** Another city picked: its weather now (none shown until it comes). */
    cityChanged: function () { weather = null; weatherAt = 0; refreshWeather(); changed(); },
    get weather() { return weather; },
    get weatherAt() { return weatherAt; },
    prices: prices,
    changes: changes,
    get pricesAt() { return pricesAt; },
    activeCoins: activeCoins,
    hasKey: function () { return !!KEY; },
    checkKey: checkKey,
    /** A key typed (or removed) on the TV: the picks come again with it, or go. */
    keyChanged: function () { KEY = Prefs.tmdbKey(); recsError = ''; failedAt = 0; refreshRecs(); changed(); },
    recsError: function () { return recsError; },
    picks: now,
    showcase: all,
    image: function (path, size) { return path ? 'https://image.tmdb.org/t/p/' + (size || 'w1280') + encodeURI(path) : ''; },

    /** Night at the location: from sunset to sunrise (the last forecast; without one, 6:00 and 18:00). */
    isNight: function (at) {
      var theme = Prefs.theme();
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      var d = new Date(at), mins = d.getHours() * 60 + d.getMinutes();
      function hm(t, fallback) { if (!t) return fallback; var x = new Date(t); return x.getHours() * 60 + x.getMinutes(); }
      var rise = hm(weather && weather.sunrise, 360), set = hm(weather && weather.sunset, 1080);
      return mins < rise || mins >= set;
    },

    compact: function (v) {
      if (isNaN(v)) return '—';
      if (v >= 1000000) return fmt(v / 1000000, 2) + 'M';
      if (v >= 10000) return fmt(v / 1000, 1) + 'k';
      if (v >= 1000) return fmt(v / 1000, 2) + 'k';
      if (v >= 100) return fmt(v, 0);
      return fmt(v, 2);
    },
    money: function (v) {
      var s = SYMBOLS[CURRENCY] || CURRENCY + ' ';
      if (isNaN(v)) return s + '—';
      return s + (v >= 1000 ? fmt(v, 0) : fmt(v, 2));
    },
    change: function (v) { return isNaN(v) ? '' : (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 1) + '%'; },
    degrees: function (v) {
      if (v === undefined || v === null || isNaN(v)) return '—';
      var unit = Prefs.temperature();
      var f = unit === 'F' || (unit === 'auto' && Place.fahrenheit);
      return Math.round(f ? v * 9 / 5 + 32 : v) + '°';
    },
    /** "3 PM", "15:00", "15 Uhr": the hourly forecast. */
    hour: function (at) { return formatDate('format|h a', at); },
    /** "Seg", "Mon", "Lun", "Mo", "Пн": the short day of the week, capitalized and without the abbreviation's dot. */
    weekday: function (at) {
      var s = formatDate('format|EEE', at).replace(/\.$/, '');
      return s.charAt(0).toUpperCase() + s.substring(1);
    },
    /** "5:21 AM", "05:21": the clock, sunrise and sunset. */
    time: function (at) { return formatDate('format|h:mm a', at); },
    /** "12 min ago" when the data is old (no internet), or empty. */
    staleness: function (at, every) {
      if (!at) return '';
      var age = Date.now() - at;
      if (age < every * 2) return '';
      var m = Math.floor(age / 60000), h = Math.floor(m / 60);
      return m < 60 ? trf('{n} min ago', {n: m}) : trf('{n} h ago', {n: h});
    },
    condition: function (code, day) {
      if (code === undefined || code === null || code < 0) return '';
      if (code === 0) return day ? tr('Clear') : tr('night|Clear');
      if (code === 1) return day ? tr('Mostly Sunny') : tr('Mostly Clear');
      if (code === 2) return tr('Partly Cloudy');
      if (code === 3) return tr('Cloudy');
      if (code === 45 || code === 48) return tr('Fog');
      if (code >= 51 && code <= 57) return tr('Drizzle');
      if (code === 65 || code === 67 || code === 82) return tr('Heavy Rain');
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return tr('Snow');
      if (code >= 95) return tr('Thunderstorms');
      return tr('Rain');
    },
    symbol: function (code, day) {
      if (code <= 1) return day ? 'sunny' : 'clear_night';
      if (code === 2) return day ? 'partly_cloudy_day' : 'partly_cloudy_night';
      if (code === 3) return 'cloud';
      if (code === 45 || code === 48) return 'foggy';
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowflake';
      if (code >= 95) return 'thunderstorm';
      return 'rainy';
    },
    coinName: function (i) { return i === 3 ? tr('Dollar') : ['Bitcoin', 'Ethereum', 'Solana'][i]; }
  };
})();
