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
  'CONTROL_AUDIO', 'CONTROL_POWER', 'WRITE_NOTIFICATION_TOAST'];
var ALLOWED = ['com.webos.applicationManager/listLaunchPoints', 'com.webos.applicationManager/getForegroundAppInfo',
  'tv/getExternalInputList', 'tv/switchInput', 'audio/getStatus', 'audio/setMute', 'system/turnOff',
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

/** done({clientKey, payload}), {refused: true} when the person said no on the TV, or null. */
function call(uri, clientKey, params, done) {
  var socket = net.connect(3000, '127.0.0.1'), buf = buffer([]), open = false, text = '', finished = false;
  var timer = setTimeout(function () { finish(null); }, 90000);   // time to answer the TV's prompt
  function finish(result) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    socket.destroy();
    done(result);
  }
  function send(obj) {
    socket.write(frame(JSON.stringify(obj)));
  }
  function onMessage(m) {
    if (m.type === 'registered') {
      clientKey = m.payload['client-key'];
      send({type: 'request', id: 'call', uri: 'ssap://' + uri, payload: params || {}});
    } else if (m.id === 'call') {
      finish(m.type === 'error' ? null : {clientKey: clientKey, payload: m.payload});
    } else if (m.type === 'error') {
      finish(m.id === 'register' ? {refused: true} : null);
    }
  }
  socket.on('connect', function () {
    socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nOrigin: file://\r\nUpgrade: websocket\r\n' +
        'Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ZnJlZW15dHYtd2Vib3MtYXBp\r\n\r\n');
  });
  socket.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    if (!open) {
      var end = buf.toString('binary').indexOf('\r\n\r\n');
      if (end < 0) return;
      if (!/^HTTP\/1\.1 101/.test(buf.toString('utf8', 0, 12))) { finish(null); return; }
      open = true;
      buf = buf.slice(end + 4);
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
      if (op === 8) { finish(null); return; }
      if (op !== 1 && op !== 0) continue;
      text += data.toString('utf8');
      if (!fin) continue;
      var m = null;
      try { m = JSON.parse(text); } catch (e) {}
      text = '';
      if (m) onMessage(m);
    }
  });
  socket.on('error', function () { finish(null); });
  socket.on('close', function () { finish(null); });
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
  return {kind: /^(eth|enp)/.test(best.name) ? 'ethernet' : 'wifi', up: up, bytes: best.bytes};
}

service.register('stats', function (message) {
  var now = Date.now(), cpu = cpuTimes(), net = network(), out = {returnValue: true, mem: memory()};
  if (cpu && lastCpu && cpu.total > lastCpu.total) {
    out.cpu = Math.round((cpu.busy - lastCpu.busy) / (cpu.total - lastCpu.total) * 100);
  }
  if (net) {
    out.net = {kind: net.kind, up: net.up};
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

function hold(on) {
  if (on && !keepAlive && service.activityManager) {
    service.activityManager.create('keepAlive', function (activity) { keepAlive = activity; });
  } else if (!on && keepAlive && !sleepTimer && !watchTimer) {
    service.activityManager.complete(keepAlive, function () {});
    keepAlive = null;
  }
}

service.register('sleep', function (message) {
  var minutes = Number((message.payload || {}).minutes) || 0;
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; sleepAt = 0; }
  if (minutes > 0 && minutes <= 240 && lastKey) {
    sleepAt = Date.now() + minutes * 60000;
    sleepTimer = setTimeout(function () {
      sleepTimer = null;
      sleepAt = 0;
      call('system/turnOff', lastKey, {}, function () { hold(false); });
    }, minutes * 60000);
    hold(true);
  } else {
    hold(false);
  }
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
  hold(false);
}

service.register('watchGoals', function (message) {
  var p = message.payload || {};
  if (p.clientKey) lastKey = p.clientKey;
  watched = (p.teams || []).slice(0, 6).filter(function (t) { return /^[a-z0-9_.]+$/.test(t.league) && /^\d+$/.test(t.id); });
  if (watched.length && !watchTimer) { watchTimer = setInterval(checkGoals, 60000); hold(true); checkGoals(); }
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
  var due = !state.at || Date.now() - state.at > RENEW_EVERY || Date.now() < state.at;
  function check() {
    lgeCall('CheckDevModeSession.dev', token, function (res) {
      var hours = hoursLeft(res && res.errorMsg);
      if (hours >= 0) state.hours = hours;
      fs.writeFile(RENEW_STATE, JSON.stringify(state), function () {});
      message.respond({returnValue: true, renewed: !!state.renewedNow, hours: state.hours === undefined ? -1 : state.hours});
    });
  }
  if (!due) { check(); return; }
  lgeCall('ResetDevModeSession.dev', token, function (res) {
    if (res && res.result === 'success') { state.at = Date.now(); state.renewedNow = true; }
    check();
  });
});
