/*
 * Free My TV's service on LG webOS: one call to the TV's remote control API (127.0.0.1:3000) for the web app.
 * Newer webOS gives each app's page its own origin (file://io.freemytv-webos), and the API closes any connection
 * that isn't from file:// ("invalid origin"); from here the handshake says file://.
 * Plain ES5 with Node's net only: older webOS ships an old Node.
 */
var net = require('net');
var Service = require('webos-service');

var service = new Service(require('./package.json').name);

// What the page may ask the TV's remote control API for, and the permissions the TV asks the person once to allow.
var PERMISSIONS = ['READ_INSTALLED_APPS', 'READ_RUNNING_APPS', 'READ_INPUT_DEVICE_LIST', 'CONTROL_INPUT_TV',
  'CONTROL_AUDIO', 'CONTROL_POWER', 'WRITE_NOTIFICATION_TOAST', 'CONTROL_MOUSE_AND_KEYBOARD', 'CONTROL_INPUT_TEXT',
  'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_PLAYBACK'];
var ALLOWED = ['com.webos.applicationManager/listLaunchPoints', 'com.webos.applicationManager/getForegroundAppInfo',
  'tv/getExternalInputList', 'tv/switchInput', 'audio/getStatus', 'system/turnOff',
  'com.webos.service.tvpower/power/turnOffScreen', 'com.webos.service.tvpower/power/turnOnScreen',
  'system.notifications/createToast'];

function buffer(x) {   // Buffer.from is missing before Node 4.5
  return Buffer.from ? Buffer.from(x) : new Buffer(x);
}

/** A client's text frame: masked, as the protocol asks. */
function frame(text) {
  var data = buffer(text), n = data.length;
  var mask = buffer([Math.random() * 256 | 0, Math.random() * 256 | 0, Math.random() * 256 | 0, Math.random() * 256 | 0]);
  for (var i = 0; i < n; i++) data[i] ^= mask[i % 4];
  return Buffer.concat([buffer(n < 126 ? [0x81, 0x80 | n] : [0x81, 0xfe, n >> 8, n & 0xff]), mask, data]);
}

/**
 * A connection to the TV's remote control API, registered with this app's permissions (the TV asks the person
 * once). on.registered(clientKey), on.message(m) for everything after, on.end() when it closes. Returns send/close.
 */
function ssapSocket(clientKey, on) {
  var socket = net.connect(3000, '127.0.0.1'), buf = buffer([]), open = false, text = '', ended = false;
  function send(obj) { socket.write(frame(JSON.stringify(obj))); }
  function end() {
    if (ended) return;
    ended = true;
    socket.destroy();
    on.end();
  }
  socket.on('connect', function () {
    socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nOrigin: file://\r\nUpgrade: websocket\r\n' +
        'Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ZnJlZW15dHYtd2Vib3MtYXBp\r\n\r\n');
  });
  socket.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    if (!open) {
      var head = buf.toString('binary').indexOf('\r\n\r\n');
      if (head < 0) return;
      if (!/^HTTP\/1\.1 101/.test(buf.toString('utf8', 0, 12))) { end(); return; }
      open = true;
      buf = buf.slice(head + 4);
      var payload = {forcePairing: false, pairingType: 'PROMPT',
        manifest: {manifestVersion: 1, appVersion: '1.0', permissions: PERMISSIONS}};
      if (clientKey) payload['client-key'] = clientKey;
      send({type: 'register', id: 'register', payload: payload});
    }
    // The server's frames: unmasked, a message possibly in several (continuation frames until FIN).
    while (buf.length >= 2) {
      var fin = buf[0] & 0x80, op = buf[0] & 0x0f, n = buf[1] & 0x7f, off = 2;
      if (n === 126) {
        if (buf.length < 4) return;
        n = buf.readUInt16BE(2);
        off = 4;
      } else if (n === 127) {
        if (buf.length < 10) return;
        n = buf.readUInt32BE(6);
        off = 10;
      }
      if (buf.length < off + n) return;
      var data = buf.slice(off, off + n);
      buf = buf.slice(off + n);
      if (op === 8) { end(); return; }
      if (op !== 1 && op !== 0) continue;
      text += data.toString('utf8');
      if (!fin) continue;
      var m = null;
      try { m = JSON.parse(text); } catch (e) {}
      text = '';
      if (!m) continue;
      if (m.type === 'registered') on.registered(m.payload['client-key']);
      else on.message(m);
    }
  });
  socket.on('error', end);
  socket.on('close', end);
  return {send: send, close: end};
}

/** done({clientKey, payload}), {refused: true} when the person said no on the TV, or null. */
function call(uri, clientKey, params, done) {
  var finished = false, timer = setTimeout(function () { finish(null); }, 90000);   // time to answer the TV's prompt
  function finish(result) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    conn.close();
    done(result);
  }
  var conn = ssapSocket(clientKey, {
    registered: function (key) {
      clientKey = key;
      conn.send({type: 'request', id: 'call', uri: 'ssap://' + uri, payload: params || {}});
    },
    message: function (m) {
      if (m.id === 'call') finish(m.type === 'error' ? null : {clientKey: clientKey, payload: m.payload});
      else if (m.type === 'error') finish(m.id === 'register' ? {refused: true} : null);
    },
    end: function () { finish(null); }
  });
}

// MARK: - System stats for the home screen (CPU, RAM, network), read from /proc, which Developer Mode apps can read.

var fs = require('fs');
var lastCpu = null, lastNet = null;

function readText(path) {
  try { return fs.readFileSync(path, 'utf8'); } catch (e) { return ''; }
}

/** {busy, total} jiffies from the first line of /proc/stat. */
function cpuTimes() {
  var f = readText('/proc/stat').split('\n')[0].split(/\s+/).slice(1).map(Number);
  if (f.length < 4) return null;
  var idle = f[3] + (f[4] || 0), total = 0;
  for (var i = 0; i < f.length; i++) total += f[i] || 0;
  return {busy: total - idle, total: total};
}

function memory() {
  var m = readText('/proc/meminfo'), total = /MemTotal:\s+(\d+)/.exec(m), avail = /MemAvailable:\s+(\d+)/.exec(m);
  var swap = /SwapTotal:\s+(\d+)/.exec(m), swapFree = /SwapFree:\s+(\d+)/.exec(m);
  if (!total || !avail) return null;
  return {totalMb: Math.round(total[1] / 1024), usedMb: Math.round((total[1] - avail[1]) / 1024),
    swapTotalMb: swap ? Math.round(swap[1] / 1024) : 0,
    swapUsedMb: swap && swapFree ? Math.round((swap[1] - swapFree[1]) / 1024) : 0};
}

/** The busiest real interface: its kind, whether it's up, and bytes received + sent. */
function network() {
  var best = null;
  readText('/proc/net/dev').split('\n').slice(2).forEach(function (line) {
    var m = /^\s*([^:]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/.exec(line);
    if (!m || !/^(eth|wlan|wlp|enp)/.test(m[1])) return;
    var bytes = +m[2] + +m[3];
    if (!best || bytes > best.bytes) best = {name: m[1], bytes: bytes};
  });
  if (!best) return null;
  var up = readText('/sys/class/net/' + best.name + '/operstate').trim() !== 'down';
  return {kind: /^(eth|enp)/.test(best.name) ? 'ethernet' : 'wifi', up: up, bytes: best.bytes, signal: wifiSignal(best.name)};
}

/** Wi-Fi link quality, 0-100, from /proc/net/wireless (its "link" column, out of 70), or -1 when not listed. */
function wifiSignal(name) {
  var m = new RegExp('^\\s*' + name + ':\\s+\\S+\\s+([\\d.]+)', 'm').exec(readText('/proc/net/wireless'));
  return m ? Math.max(0, Math.min(100, Math.round(parseFloat(m[1]) / 70 * 100))) : -1;
}

service.register('stats', function (message) {
  var now = Date.now(), cpu = cpuTimes(), net = network(), out = {returnValue: true, mem: memory()};
  if (cpu && lastCpu && cpu.total > lastCpu.total) {
    out.cpu = Math.round((cpu.busy - lastCpu.busy) / (cpu.total - lastCpu.total) * 100);
  }
  if (net) {
    out.net = {kind: net.kind, up: net.up, signal: net.signal};
    if (lastNet && now > lastNet.at && net.bytes >= lastNet.bytes) {
      out.net.kbps = Math.round((net.bytes - lastNet.bytes) * 8 / (now - lastNet.at));
    }
    lastNet = {bytes: net.bytes, at: now};
  }
  lastCpu = cpu;
  message.respond(out);
});

// MARK: - Football: next or live match and last result per team, from ESPN's public API (no CORS for the page)

var https = require('https');
var ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
var footballCache = {};   // url -> {at, data}

function getJson(url, done) {
  var hit = footballCache[url];
  if (hit && Date.now() - hit.at < 50000) { done(hit.data); return; }
  var req = https.get(url, function (res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function (c) { if (body.length < 2e6) body += c; });
    res.on('end', function () {
      var data = null;
      try { data = JSON.parse(body); } catch (e) {}
      if (data) footballCache[url] = {at: Date.now(), data: data};
      done(data);
    });
  });
  req.on('error', function () { done(null); });
  req.setTimeout(8000, function () { req.abort(); });
}

/** A match as the page needs it: who, when, the state and the score (only digits leave here). */
function match(e) {
  var c = e && e.competitions && e.competitions[0];
  if (!c) return null;
  var side = {};
  (c.competitors || []).forEach(function (x) {
    var score = x.score && typeof x.score === 'object' ? x.score.displayValue : x.score;
    side[x.homeAway] = {abbr: String((x.team && x.team.abbreviation) || '').slice(0, 4),
      id: String((x.team && x.team.id) || '').replace(/\D/g, ''), score: /^\d+$/.test(String(score)) ? +score : null};
  });
  var s = c.status || {}, type = s.type || {};
  return {date: e.date, state: type.state, done: !!type.completed, clock: String(s.displayClock || '').slice(0, 8),
    league: String((e.league && e.league.abbreviation) || (e.season && e.season.slug) || '').slice(0, 30),
    home: side.home || null, away: side.away || null};
}

service.register('football', function (message) {
  var teams = ((message.payload || {}).teams || []).slice(0, 6), out = [], left = teams.length;
  if (!left) { message.respond({returnValue: true, teams: []}); return; }
  teams.forEach(function (t, i) {
    var league = /^[a-z0-9_.]+$/.test(t.league) ? t.league : 'bra.1', id = String(t.id).replace(/\D/g, '');
    getJson(ESPN + league + '/teams/' + id, function (team) {
      getJson(ESPN + league + '/teams/' + id + '/schedule', function (sched) {
        var info = team && team.team, played = ((sched && sched.events) || []).map(match).filter(function (m) {
          return m && m.done;
        }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        out[i] = {id: id, abbr: info ? String(info.abbreviation || '').slice(0, 4) : '',
          name: info ? String(info.shortDisplayName || info.displayName || '').slice(0, 30) : '',
          next: info && info.nextEvent ? match(info.nextEvent[0]) : null, last: played[0] || null};
        if (--left === 0) message.respond({returnValue: true, teams: out});
      });
    });
  });
});

// MARK: - Backup of the settings in a file the computer can copy (webos/backup.py), so a reinstall keeps them

var BACKUP = '/media/developer/temp/freemytv-backup.json';

service.register('backup', function (message) {
  var p = message.payload || {};
  if (p.action === 'save') {
    var data = String(p.data || '');
    try { JSON.parse(data); } catch (e) { message.respond({returnValue: false, errorText: 'not JSON'}); return; }
    if (data.length > 100000) { message.respond({returnValue: false, errorText: 'too big'}); return; }
    fs.writeFile(BACKUP, data, function (err) { message.respond({returnValue: !err}); });
  } else {
    fs.readFile(BACKUP, 'utf8', function (err, data) {
      message.respond(err ? {returnValue: true, data: ''} : {returnValue: true, data: data});
    });
  }
});

service.register('ssap', function (message) {
  var p = message.payload || {};
  if (ALLOWED.indexOf(p.uri) < 0) { message.respond({returnValue: false, errorText: 'Not allowed: ' + p.uri}); return; }
  if (p.clientKey) lastKey = p.clientKey;
  call(p.uri, p.clientKey, p.params, function (result) {
    if (result && result.clientKey) lastKey = result.clientKey;
    if (!result) message.respond({returnValue: false, errorText: 'No answer from the remote control API'});
    else {
      result.returnValue = true;
      message.respond(result);
    }
  });
});

// MARK: - Work that outlives the page (another app in front): the sleep timer and goal alerts. While either runs,
// an activity keeps the service from being stopped as idle.

var lastKey = null, keepAlive = null, sleepTimer = null, sleepAt = 0, watchTimer = null, watched = [], scores = {};

var keepAsking = false;

/** Keeps the service alive exactly while a timer, a reminder or a match watch is pending. */
function hold() {
  var need = !!(sleepTimer || watchTimer || reminderTimer || phone.server || back.on);
  if (!service.activityManager) return;
  if (need && !keepAlive && !keepAsking) {
    keepAsking = true;
    service.activityManager.create('keepAlive', function (activity) { keepAsking = false; keepAlive = activity; hold(); });
  } else if (!need && keepAlive) {
    service.activityManager.complete(keepAlive, function () {});
    keepAlive = null;
  }
}

service.register('sleep', function (message) {
  var minutes = Number((message.payload || {}).minutes) || 0;
  if ((message.payload || {}).clientKey) lastKey = message.payload.clientKey;
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; sleepAt = 0; }
  if (minutes > 0 && minutes <= 240 && lastKey) {
    sleepAt = Date.now() + minutes * 60000;
    sleepTimer = setTimeout(function () {
      sleepTimer = null;
      sleepAt = 0;
      call('system/turnOff', lastKey, {}, function () {});
      hold();
    }, minutes * 60000);
  }
  hold();
  message.respond({returnValue: true, at: sleepAt});
});

function toast(text) {
  if (lastKey) call('system.notifications/createToast', lastKey, {message: String(text).slice(0, 80)}, function () {});
}

/** Every minute while a followed team plays: a toast on any app when the score changes. */
function checkGoals() {
  var live = false, left = watched.length;
  if (!left) { stopWatching(); return; }
  watched.forEach(function (t) {
    getJson(ESPN + t.league + '/teams/' + t.id, function (team) {
      var e = team && team.team && team.team.nextEvent && team.team.nextEvent[0], m = match(e);
      if (m && m.state === 'pre' && Date.parse(m.date) - Date.now() < 3 * 3600000) live = true;   // about to start
      if (m && m.state === 'in' && m.home && m.away) {
        live = true;
        var key = m.date + m.home.id, score = m.home.score + ':' + m.away.score;
        if (scores[key] !== undefined && scores[key] !== score) {
          toast('GOL! ' + m.home.abbr + ' ' + m.home.score + ' × ' + m.away.score + ' ' + m.away.abbr + ' · ' + m.clock);
        }
        scores[key] = score;
      }
      if (--left === 0 && !live) stopWatching();
    });
  });
}

function stopWatching() {
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  hold();
}

service.register('watchGoals', function (message) {
  var p = message.payload || {};
  if (p.clientKey) lastKey = p.clientKey;
  watched = (p.teams || []).slice(0, 6).filter(function (t) { return /^[a-z0-9_.]+$/.test(t.league) && /^\d+$/.test(t.id); });
  if (watched.length && !watchTimer) { watchTimer = setInterval(checkGoals, 60000); hold(); checkGoals(); }
  if (!watched.length) stopWatching();
  message.respond({returnValue: true});
});

// MARK: - Developer Mode renewal from the TV itself: LG's session lasts 1000 h, and the TV removes this app when it
// ends. Once a day, when the home screen opens, the session goes back to 1000 h (the same call LG's EXTEND makes).

var DEVMODE_TOKEN = '/var/luna/preferences/devmode_enabled';
var RENEW_STATE = '/media/developer/temp/freemytv-renew.json';
var LGE = 'https://developer.lge.com/secure/';
var RENEW_EVERY = 20 * 3600000;

function lgeCall(path, token, done) {
  var req = https.get(LGE + path + '?sessionToken=' + encodeURIComponent(token), function (res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function (c) { if (body.length < 10000) body += c; });
    res.on('end', function () {
      var data = null;
      try { data = JSON.parse(body); } catch (e) {}
      done(data);
    });
  });
  req.on('error', function () { done(null); });
  req.setTimeout(15000, function () { req.abort(); });
}

/** "999:59:59" (hours:minutes:seconds left) to hours, or -1. */
function hoursLeft(text) {
  var m = /^(\d+):\d+:\d+$/.exec(String(text || ''));
  return m ? +m[1] : -1;
}

service.register('renewDevMode', function (message) {
  var token = readText(DEVMODE_TOKEN).trim(), state = {};
  try { state = JSON.parse(readText(RENEW_STATE)) || {}; } catch (e) {}
  if (!/^[0-9a-f]{20,128}$/i.test(token)) {
    message.respond({returnValue: false, errorText: 'no token', hours: state.hours || -1});
    return;
  }
  var due = !state.at || Date.now() - state.at > RENEW_EVERY || Date.now() < state.at, renewed = false;
  function check() {
    lgeCall('CheckDevModeSession.dev', token, function (res) {
      var hours = hoursLeft(res && res.errorMsg);
      if (hours >= 0) state.hours = hours;
      fs.writeFile(RENEW_STATE, JSON.stringify(state), function () {});
      message.respond({returnValue: true, renewed: renewed, hours: state.hours === undefined ? -1 : state.hours});
    });
  }
  if (!due) { check(); return; }
  lgeCall('ResetDevModeSession.dev', token, function (res) {
    if (res && res.result === 'success') { state.at = Date.now(); renewed = true; }
    check();
  });
});

// MARK: - Headlines (ge and g1 RSS) and exchange rates (AwesomeAPI), cached for 10 minutes

var HEADLINE_FEEDS = [['GE', 'https://ge.globo.com/rss/ge/futebol/'], ['G1', 'https://g1.globo.com/rss/g1/']];
var infoCache = {at: 0, data: null};

function getText(url, done) {
  var req = https.get(url, function (res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function (c) { if (body.length < 500000) body += c; });
    res.on('end', function () { done(body); });
  });
  req.on('error', function () { done(''); });
  req.setTimeout(10000, function () { req.abort(); });
}

/** Item titles of an RSS feed, plain text (CDATA and entities undone, tags dropped). */
function titles(xml) {
  var out = [], re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g, m;
  while ((m = re.exec(xml)) && out.length < 8) {
    var t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (t) out.push(t.slice(0, 140));
  }
  return out;
}

service.register('headlines', function (message) {
  if (infoCache.data && Date.now() - infoCache.at < 600000) { message.respond(infoCache.data); return; }
  var out = {returnValue: true, headlines: [], rates: {}}, left = HEADLINE_FEEDS.length + 1;
  function finish() {
    if (--left) return;
    infoCache = {at: Date.now(), data: out};
    message.respond(out);
  }
  HEADLINE_FEEDS.forEach(function (feed) {
    getText(feed[1], function (xml) {
      titles(xml).forEach(function (t) { out.headlines.push({source: feed[0], title: t}); });
      finish();
    });
  });
  getText('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL', function (body) {
    try {
      var o = JSON.parse(body);
      out.rates = {USD: +o.USDBRL.bid, EUR: +o.EURBRL.bid};
    } catch (e) {}
    finish();
  });
});

// MARK: - Internet speed: a 10 MB download from Cloudflare's speed test, timed (nothing is kept)

service.register('speedTest', function (message) {
  var started = Date.now(), bytes = 0, done = false;
  function finish(ok) {
    if (done) return;
    done = true;
    var secs = (Date.now() - started) / 1000;
    message.respond({returnValue: ok && bytes > 0, mbps: ok ? Math.round(bytes * 8 / secs / 1e5) / 10 : 0});
  }
  var req = https.get('https://speed.cloudflare.com/__down?bytes=10000000', function (res) {
    res.on('data', function (c) { bytes += c.length; });
    res.on('end', function () { finish(true); });
  });
  req.on('error', function () { finish(false); });
  req.setTimeout(30000, function () { req.abort(); finish(bytes > 1e6); });
});

// MARK: - Match reminder: a toast 10 minutes before a followed team's next match, on any app

var reminderTimer = null, reminderAt = 0;

service.register('remind', function (message) {
  var p = message.payload || {}, at = Date.parse(p.date) - 10 * 60000, text = String(p.text || '').slice(0, 80);
  if (p.clientKey) lastKey = p.clientKey;
  if (at !== reminderAt) {
    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = null;
    reminderAt = 0;
    // Only within 3 hours: the activity that keeps the service alive shouldn't last for days.
    if (at > Date.now() && at - Date.now() < 3 * 3600000 && text) {
      reminderAt = at;
      reminderTimer = setTimeout(function () { reminderTimer = null; toast(text); hold(); }, at - Date.now());
    }
  }
  message.respond({returnValue: true, at: reminderAt});
});

// MARK: - The phone: a page on the home network that is a remote control (any app, through the TV's own pointer
// input) and types text (into Free My TV's search when open, else into the field the app in front has). A phone
// pairs once with the 4-digit code shown on the TV; its token is kept, so it isn't asked again.

var http = require('http'), os = require('os'), crypto = require('crypto');
var PHONES = '/media/developer/temp/freemytv-phones.json';
var phone = {server: null, code: '', text: '', port: 8770, fails: 0, searching: false, tokens: null, pointer: null};

function lanAddress() {
  var nets = os.networkInterfaces();
  for (var name in nets) {
    for (var i = 0; i < nets[name].length; i++) {
      var a = nets[name][i];
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return '';
}

function tokens() {
  if (!phone.tokens) {
    try { phone.tokens = JSON.parse(readText(PHONES)) || []; } catch (e) { phone.tokens = []; }
  }
  return phone.tokens;
}

function newCode() {
  phone.code = String(1000 + Math.floor(Math.random() * 9000));
  phone.fails = 0;
}

function pairedBy(req) {
  var m = /(?:^|;\s*)fmtv=([0-9a-f]{32})/.exec(req.headers.cookie || '');
  return !!m && tokens().indexOf(m[1]) >= 0;
}

/** A new token for a phone that typed the right code (5 wrong codes lock pairing until a new code is shown). */
function pair(code, res) {
  if (phone.fails >= 5 || !phone.code || code !== phone.code) { phone.fails++; return false; }
  var token = crypto.randomBytes(16).toString('hex'), list = tokens();
  list.push(token);
  if (list.length > 8) list.shift();
  fs.writeFile(PHONES, JSON.stringify(list), function () {});
  res.setHeader('Set-Cookie', 'fmtv=' + token + '; Max-Age=31536000; Path=/; HttpOnly; SameSite=Strict');
  return true;
}

/** A WebSocket to a path on the TV's remote control server (the pointer input socket), text frames out only. */
function wsOpen(url, onEnd) {
  var m = /^wss?:\/\/[^\/]+(\/.*)$/.exec(url || ''), socket = net.connect(3000, '127.0.0.1'), open = false, queue = [];
  if (!m) { onEnd(); return null; }
  socket.on('connect', function () {
    socket.write('GET ' + m[1] + ' HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ZnJlZW15dHYtcG9pbnRlcg==\r\n\r\n');
  });
  socket.on('data', function (chunk) {
    if (open) return;   // nothing to read from it
    if (!/^HTTP\/1\.1 101/.test(chunk.toString('utf8', 0, 12))) { socket.destroy(); return; }
    open = true;
    for (var i = 0; i < queue.length; i++) socket.write(frame(queue[i]));
    queue = [];
  });
  socket.on('error', function () { socket.destroy(); });
  socket.on('close', onEnd);
  return {send: function (text) { if (open) socket.write(frame(text)); else queue.push(text); }};
}

var KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'BACK', 'HOME', 'VOLUMEUP', 'VOLUMEDOWN', 'MUTE', 'PLAY', 'PAUSE'];

/** A remote button, as if pressed on the remote: works on any app in front. */
function pressKey(name) {
  if (KEYS.indexOf(name) < 0 || !lastKey) return;
  if (phone.pointer) { phone.pointer.send('type:button\nname:' + name + '\n\n'); return; }
  call('com.webos.service.networkinput/getPointerInputSocket', lastKey, {}, function (res) {
    var path = res && res.payload && res.payload.socketPath;
    if (!path || phone.pointer) return;
    phone.pointer = wsOpen(path, function () { phone.pointer = null; });
    if (phone.pointer) phone.pointer.send('type:button\nname:' + name + '\n\n');
  });
}

/** Text from the phone: Free My TV's search takes it when open; otherwise the TV's keyboard types it. */
function typeText(text) {
  if (phone.searching) { phone.text = text; return; }
  if (lastKey) call('com.webos.service.ime/insertText', lastKey, {text: text, replace: 0}, function () {});
}

var REMOTE_PAGE = '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1,user-scalable=no">' +
  '<title>Free My TV</title><style>body{font:18px system-ui;background:#0B0B0D;color:#F2F2F3;margin:0;padding:18px;' +
  '-webkit-user-select:none;user-select:none}button,input{font:inherit;color:inherit;border-radius:16px;border:1px solid #2a2a30;' +
  'background:#141417}button{padding:18px 0;font-weight:700}button:active{background:#E5484D}.pad{display:grid;' +
  'grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0}.pad .ok{border-radius:50%;aspect-ratio:1}.row{display:grid;' +
  'grid-template-columns:1fr 1fr 1fr;gap:10px;margin:10px 0}form{display:flex;gap:8px;margin-top:18px}form input{flex:1;' +
  'padding:14px}form button{padding:14px 18px;background:#E5484D;border:0}h1{font-size:18px;color:#FF7A7F;letter-spacing:.1em;' +
  'text-transform:uppercase;margin:4px 0}</style><h1>Controle da TV</h1>' +
  '<div class=pad><span></span><button data-k=UP>▲</button><span></span><button data-k=LEFT>◀</button>' +
  '<button class=ok data-k=ENTER>OK</button><button data-k=RIGHT>▶</button><span></span><button data-k=DOWN>▼</button>' +
  '<span></span></div><div class=row><button data-k=BACK>Voltar</button><button data-k=HOME>Início</button>' +
  '<button data-k=PLAY>▶ / ❚❚</button></div><div class=row><button data-k=VOLUMEDOWN>Vol −</button>' +
  '<button data-k=MUTE>Mudo</button><button data-k=VOLUMEUP>Vol +</button></div>' +
  '<form id=t><input name=q placeholder="Digitar na TV" autocomplete=off><button>Enviar</button></form><script>' +
  'function post(p,b){return fetch(p,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b})}' +
  'document.querySelectorAll("[data-k]").forEach(function(b){b.onclick=function(){post("/key","name="+b.dataset.k);' +
  'if(navigator.vibrate)navigator.vibrate(15)}});var t=document.getElementById("t");t.onsubmit=function(e){' +
  'e.preventDefault();var q=t.q.value.trim();if(q)post("/text","q="+encodeURIComponent(q));t.q.value=""}</script>';

var PAIR_PAGE = '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Free My TV</title>' +
  '<style>body{font:18px system-ui;background:#0B0B0D;color:#F2F2F3;margin:24px}input,button{font:inherit;width:100%;' +
  'box-sizing:border-box;padding:14px;margin:8px 0;border-radius:12px;border:1px solid #333;background:#141417;color:inherit}' +
  'button{background:#E5484D;border:0;font-weight:700}</style><h2>Parear com a TV</h2><p>%MSG%</p><form method=post action=/pair>' +
  '<input name=code inputmode=numeric placeholder="Código que aparece na TV" required autofocus><button>Parear</button></form>';

function body(req, done) {
  var text = '';
  req.on('data', function (c) { if (text.length < 2000) text += c; });
  req.on('end', function () { done(require('querystring').parse(text)); });
}

function startServer() {
  if (phone.server) return;
  phone.server = http.createServer(function (req, res) {
    var path = (req.url || '/').split('?')[0];
    function page(html) { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); }
    if (req.method === 'POST' && path === '/pair') {
      body(req, function (f) {
        if (pair(String(f.code || ''), res)) { res.writeHead(303, {Location: '/'}); res.end(); }
        else page(PAIR_PAGE.replace('%MSG%', phone.fails >= 5 ? 'Muitas tentativas: abra o QR de novo na TV.' : 'Código errado.'));
      });
      return;
    }
    if (req.method === 'POST' && (path === '/key' || path === '/text')) {
      if (!pairedBy(req)) { res.writeHead(403); res.end(); return; }
      body(req, function (f) {
        if (path === '/key') pressKey(String(f.name || ''));
        else if (f.q) typeText(String(f.q).slice(0, 100));
        res.writeHead(204);
        res.end();
      });
      return;
    }
    // The QR code's link carries the code (?c=1234): the phone pairs by opening it.
    var given = /[?&]c=(\d{4})(&|$)/.exec(req.url || '');
    if (!pairedBy(req) && given && pair(given[1], res)) { res.writeHead(303, {Location: '/'}); res.end(); return; }
    page(pairedBy(req) ? REMOTE_PAGE : PAIR_PAGE.replace('%MSG%', 'Digite o código que aparece na TV.'));
  });
  phone.server.on('error', function () { phone.server = null; hold(); });
  phone.server.listen(phone.port);
  hold();   // webOS stops an idle service, and the page would go with it
}

/**
 * remote: keep the page up (on) or not; show: a fresh code and the QR to pair a phone; start/stop: Free My TV's
 * search is open/closed (text goes there); poll: the text typed since the last poll.
 */
service.register('phone', function (message) {
  var p = message.payload || {}, url = 'http://' + lanAddress() + ':' + phone.port;
  if (p.clientKey) lastKey = p.clientKey;
  if (p.action === 'remote') {
    if (p.on) startServer();
    else if (phone.server && !phone.searching) { phone.server.close(); phone.server = null; hold(); }
    message.respond({returnValue: true});
  } else if (p.action === 'start' || p.action === 'show') {
    if (p.action === 'start') phone.searching = true;
    startServer();
    newCode();
    message.respond({returnValue: !!lanAddress(), url: url, code: phone.code, qr: qrEncode(url + '/?c=' + phone.code)});
  } else if (p.action === 'poll') {
    var text = phone.text;
    phone.text = '';
    message.respond({returnValue: true, text: text, on: !!phone.server});
  } else {
    phone.searching = false;
    phone.text = '';
    message.respond({returnValue: true});
  }
});

// MARK: - Formula 1: the next Grand Prix from ESPN's calendar

service.register('f1', function (message) {
  getJson('https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard', function (d) {
    var cal = (d && d.leagues && d.leagues[0] && d.leagues[0].calendar) || [], now = Date.now(), next = null;
    for (var i = 0; i < cal.length && !next; i++) if (Date.parse(cal[i].endDate) > now) next = cal[i];
    var name = next ? String(next.label || '') : '', m = /(\S+(?: \S+)?) Grand Prix$/.exec(name);
    message.respond({returnValue: true, race: next ? {name: m ? m[1] : name.slice(0, 30), date: next.endDate} : null});
  });
});

// MARK: - A league's teams, for picking which ones to follow

service.register('teams', function (message) {
  var league = String((message.payload || {}).league || '');
  if (!/^[a-z0-9_.]+$/.test(league)) { message.respond({returnValue: false}); return; }
  getJson(ESPN + league + '/teams', function (d) {
    var list = (d && d.sports && d.sports[0] && d.sports[0].leagues && d.sports[0].leagues[0].teams) || [];
    message.respond({returnValue: true, teams: list.map(function (x) {
      return {id: String(x.team.id).replace(/\D/g, ''), name: String(x.team.shortDisplayName || x.team.displayName).slice(0, 30)};
    }).sort(function (a, b) { return a.name < b.name ? -1 : 1; })});
  });
});

// MARK: - QR code for the phone page's address: app/src/io/freemytv/Qr.java (after Project Nayuki's QR Code generator,
// MIT, notice there) in plain ES5. Byte mode, level M, versions 1 to 10; the mask with the lowest penalty.

var QR_ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], QR_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
var QR_FINDER = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];

function qrRawModules(v) {
  var n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    var align = ((v / 7) | 0) + 2;
    n -= (25 * align - 10) * align - 55;
    if (v >= 7) n -= 36;
  }
  return n;
}

function qrDataCodewords(v) { return ((qrRawModules(v) / 8) | 0) - QR_ECC[v] * QR_BLOCKS[v]; }

function qrGrid(size) {
  var g = [];
  for (var y = 0; y < size; y++) { g.push([]); for (var x = 0; x < size; x++) g[y].push(false); }
  return g;
}

function qrEncode(text) {
  var data = Buffer.from ? Buffer.from(String(text), 'utf8') : new Buffer(String(text), 'utf8');
  var version = 1;
  while (data.length > qrDataCodewords(version) - (version < 10 ? 2 : 3)) {
    if (++version > 10) return null;
  }
  var size = version * 4 + 17, m = qrGrid(size), f = qrGrid(size);
  function set(x, y, dark) { m[y][x] = dark; f[y][x] = true; }

  function drawFormat(mask) {
    var rem = mask, i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = (mask << 10 | rem) ^ 0x5412;
    function bit(k) { return ((bits >>> k) & 1) !== 0; }
    for (i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  }

  function drawFinder(cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }

  // Function patterns: timing, finders, alignment, format area, version info.
  var i, j, a;
  for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  var align = [];
  if (version > 1) {
    var n = ((version / 7) | 0) + 2, step = (((version * 4 + n * 2 + 1) / (n * 2 - 2)) | 0) * 2;
    align[0] = 6;
    for (i = n - 1, a = version * 4 + 10; i >= 1; i--, a -= step) align[i] = a;
  }
  for (i = 0; i < align.length; i++) {
    for (j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(0);
  if (version >= 7) {
    var vr = version;
    for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >>> 11) * 0x1F25);
    var vbits = version << 12 | vr;
    for (i = 0; i < 18; i++) {
      var dark = ((vbits >>> i) & 1) !== 0, p = size - 11 + i % 3, q = (i / 3) | 0;
      set(p, q, dark);
      set(q, p, dark);
    }
  }

  // Data codewords: byte mode, count, bytes, terminator, padding.
  var cw = [], at = 0, total = qrDataCodewords(version);
  for (i = 0; i < total; i++) cw.push(0);
  function append(value, bits) {
    for (var k = bits - 1; k >= 0; k--, at++) if (((value >>> k) & 1) !== 0) cw[at >>> 3] |= 0x80 >>> (at & 7);
  }
  append(4, 4);
  append(data.length, version < 10 ? 8 : 16);
  for (i = 0; i < data.length; i++) append(data[i], 8);
  append(0, Math.min(4, total * 8 - at));
  append(0, (8 - at % 8) % 8);
  for (var pad = 0xEC; at < total * 8; pad ^= 0xEC ^ 0x11) append(pad, 8);

  // Reed-Solomon per block, then interleaved.
  function gfMul(x, y) {
    var z = 0;
    for (var k = 7; k >= 0; k--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> k) & 1) * x; }
    return z;
  }
  var ecc = QR_ECC[version], blocks = QR_BLOCKS[version], raw = (qrRawModules(version) / 8) | 0;
  var shortBlocks = blocks - raw % blocks, shortLen = (raw / blocks) | 0, div = [], root = 1;
  for (i = 0; i < ecc; i++) div.push(0);
  div[ecc - 1] = 1;
  for (i = 0; i < ecc; i++) {
    for (j = 0; j < ecc; j++) { div[j] = gfMul(div[j], root); if (j + 1 < ecc) div[j] ^= div[j + 1]; }
    root = gfMul(root, 2);
  }
  var all = [], k0 = 0;
  for (i = 0; i < blocks; i++) {
    var len = shortLen - ecc + (i < shortBlocks ? 0 : 1), block = [], rem2 = [];
    for (j = 0; j < shortLen + 1; j++) block.push(0);
    for (j = 0; j < ecc; j++) rem2.push(0);
    for (j = 0; j < len; j++) {
      block[j] = cw[k0 + j];
      var factor = cw[k0 + j] ^ rem2[0];
      rem2.shift();
      rem2.push(0);
      for (var r = 0; r < ecc; r++) rem2[r] ^= gfMul(div[r], factor);
    }
    for (j = 0; j < ecc; j++) block[block.length - ecc + j] = rem2[j];
    k0 += len;
    all.push(block);
  }
  var out = [];
  for (i = 0; i < shortLen + 1; i++) {
    for (j = 0; j < blocks; j++) if (i !== shortLen - ecc || j >= shortBlocks) out.push(all[j][i]);
  }

  // Codewords placed two columns at a time from the right, zigzagging.
  var bitAt = 0;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!f[y][x] && bitAt < out.length * 8) { m[y][x] = ((out[bitAt >>> 3] >>> (7 - (bitAt & 7))) & 1) !== 0; bitAt++; }
      }
    }
  }

  function applyMask(mask) {
    for (var yy = 0; yy < size; yy++) {
      for (var xx = 0; xx < size; xx++) {
        var inv;
        switch (mask) {
          case 0: inv = (xx + yy) % 2 === 0; break;
          case 1: inv = yy % 2 === 0; break;
          case 2: inv = xx % 3 === 0; break;
          case 3: inv = (xx + yy) % 3 === 0; break;
          case 4: inv = (((xx / 3) | 0) + ((yy / 2) | 0)) % 2 === 0; break;
          case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
          case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
          default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
        }
        if (inv && !f[yy][xx]) m[yy][xx] = !m[yy][xx];
      }
    }
  }

  function cell(pass, p1, p2) { return pass === 0 ? m[p1][p2] : m[p2][p1]; }

  function finderLike(pass, p1, p2, reversed) {
    for (var k = 0; k < 11; k++) if (cell(pass, p1, p2 + k) !== !!QR_FINDER[reversed ? 10 - k : k]) return false;
    return true;
  }

  function penalty() {
    var score = 0, darkCount = 0, pass, p1, p2;
    for (pass = 0; pass < 2; pass++) {
      for (p1 = 0; p1 < size; p1++) {
        var run = 1;
        for (p2 = 1; p2 <= size; p2++) {
          if (p2 < size && cell(pass, p1, p2) === cell(pass, p1, p2 - 1)) run++;
          else { if (run >= 5) score += 3 + run - 5; run = 1; }
        }
        for (p2 = 0; p2 + 11 <= size; p2++) if (finderLike(pass, p1, p2, false) || finderLike(pass, p1, p2, true)) score += 40;
      }
    }
    for (var yy = 0; yy < size; yy++) {
      for (var xx = 0; xx < size; xx++) {
        if (m[yy][xx]) darkCount++;
        if (xx + 1 < size && yy + 1 < size && m[yy][xx] === m[yy][xx + 1] && m[yy][xx] === m[yy + 1][xx] &&
            m[yy][xx] === m[yy + 1][xx + 1]) score += 3;
      }
    }
    var cells = size * size;
    score += (((Math.abs(darkCount * 20 - cells * 10) + cells - 1) / cells | 0) - 1) * 10;
    return score;
  }

  var best = Infinity, chosen = 0;
  for (var mk = 0; mk < 8; mk++) {
    applyMask(mk);
    drawFormat(mk);
    var s = penalty();
    if (s < best) { best = s; chosen = mk; }
    applyMask(mk);
  }
  applyMask(chosen);
  drawFormat(chosen);
  // One string per row, '1' dark: small to send to the page, which draws it.
  return m.map(function (row) { return row.map(function (d) { return d ? '1' : '0'; }).join(''); });
}

// MARK: - Back to Free My TV: whenever LG's home comes up (leaving an app, Home, anything), Free My TV comes back,
// since it replaces that home. Home Settings can turn it off.

var LG_HOME = /^com\.webos\.app\.home$/;
var back = {on: false, conn: null, key: null, prev: '', at: 0, retry: null, log: []};

function backLog(text) {
  back.log.push(new Date().toISOString().slice(11, 19) + ' ' + text);
  if (back.log.length > 30) back.log.shift();
}

function launchHome() {
  service.call('luna://com.webos.applicationManager/launch', {id: 'io.freemytv'}, function () {});
}

function onForeground(appId) {
  if (!appId) return;   // empty while switching
  backLog(back.prev + ' -> ' + appId);
  if (LG_HOME.test(appId) && Date.now() - back.at > 3000) {   // once per visit, even if the home reports twice
    back.at = Date.now();
    launchHome();
  }
  back.prev = appId;
}

function watchForeground() {
  if (!back.on || back.conn) return;
  back.conn = ssapSocket(back.key, {
    registered: function (key) {
      back.key = key;
      back.conn.send({type: 'subscribe', id: 'fg', uri: 'ssap://com.webos.applicationManager/getForegroundAppInfo'});
    },
    message: function (m) {
      if (m.id === 'fg' && m.payload) onForeground(m.payload.appId);
      else if (m.type === 'error') backLog('erro: ' + (m.error || ''));
    },
    end: function () {
      back.conn = null;
      if (back.on) back.retry = setTimeout(watchForeground, 2000);   // the TV's API drops it now and then
    }
  });
}

/** on: turn the watch on or off; the answer has the last transitions seen, for checking it on a TV. */
service.register('backHome', function (message) {
  var p = message.payload || {};
  if (p.clientKey) back.key = p.clientKey;
  if (p.on === true && !back.on) { back.on = true; watchForeground(); }
  if (p.on === false && back.on) {
    back.on = false;
    clearTimeout(back.retry);
    if (back.conn) back.conn.close();
  }
  hold();
  message.respond({returnValue: true, on: back.on, watching: !!back.conn, log: back.log.slice(-10)});
});
