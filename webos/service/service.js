/*
 * Free My TV's service on LG webOS: one call to the TV's remote control API (127.0.0.1:3000) for the web app.
 * Newer webOS gives each app's page its own origin (file://io.freemytv-webos), and the API closes any connection
 * that isn't from file:// ("invalid origin"); from here the handshake says file://.
 * Plain ES5 with Node's net only: older webOS ships an old Node.
 */
var net = require('net');
var Service = require('webos-service');

var service = new Service(require('./package.json').name);

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
function call(uri, clientKey, done) {
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
      send({type: 'request', id: 'call', uri: 'ssap://' + uri});
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
        manifest: {manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS']}};
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

service.register('ssap', function (message) {
  var p = message.payload || {};
  // Only the app list, the one call the page makes: nothing else goes to the TV's API, nor gets its client key.
  if (p.uri !== 'com.webos.applicationManager/listLaunchPoints') {
    message.respond({returnValue: false, errorText: 'Only listLaunchPoints'});
    return;
  }
  call(p.uri, p.clientKey, function (result) {
    if (!result) message.respond({returnValue: false, errorText: 'No answer from the remote control API'});
    else {
      result.returnValue = true;
      message.respond(result);
    }
  });
});
