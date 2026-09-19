/**
 * Mobin Panel — local development server
 * Created by Mobin.A
 *
 * Runs the production bundle (dist/worker.js) on a plain Node HTTP server with
 * an in-memory KV namespace, so the whole panel (UI + API + subscription
 * endpoints + WS proxy) can be exercised without a Cloudflare account:
 *
 *   npm run build && npm run dev
 *   → http://localhost:8787
 *
 * The in-memory KV is reset on every start (fresh "panel not initialized"
 * state, just like a brand-new deployment).
 *
 * NOTE: the Workers runtime provides `WebSocketPair` and
 * `request.upgrade(server)`; Node does not. This harness implements a minimal
 * RFC-6455 compatible emulation of those two APIs (dev/testing only — the
 * deployed Worker always uses the real runtime).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

let worker;
try {
  worker = (await import(pathToFileURL('dist/worker.js').href)).default;
} catch (e) {
  console.error(`✖ Could not load dist/worker.js — run "npm run build" first.\n  ${e.message}`);
  process.exit(1);
}

/* ------------------------------ in-memory KV ------------------------------ */

class MemoryKV {
  store = new Map();
  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  async put(key, value) {
    this.store.set(key, value);
  }
  async delete(key) {
    this.store.delete(key);
  }
  async list(opts = {}) {
    const prefix = opts.prefix ?? '';
    return {
      keys: [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    };
  }
}

/* ------------------- minimal RFC-6455 frame codec (dev shim) --------------- */

const OPCODE = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

function encodeFrame(opcode, payload, mask = false) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, (mask ? 0x80 : 0) | len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = (mask ? 0x80 : 0) | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = (mask ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  if (!mask) return Buffer.concat([header, data]);
  const maskKey = crypto.randomBytes(4);
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i++) masked[i] ^= maskKey[i % 4];
  return Buffer.concat([header, maskKey, masked]);
}

class FrameParser {
  constructor(onFrame) {
    this.buf = Buffer.alloc(0);
    this.onFrame = onFrame;
  }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.buf.length < 2) return;
      const fin = (this.buf[0] & 0x80) !== 0;
      const opcode = this.buf[0] & 0x0f;
      const masked = (this.buf[1] & 0x80) !== 0;
      let len = this.buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < off + 2) return;
        len = this.buf.readUInt16BE(off);
        off += 2;
      } else if (len === 127) {
        if (this.buf.length < off + 8) return;
        len = Number(this.buf.readBigUInt64BE(off));
        off += 8;
      }
      let maskKey = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        maskKey = this.buf.subarray(off, off + 4);
        off += 4;
      }
      if (this.buf.length < off + len) return;
      const payload = Buffer.from(this.buf.subarray(off, off + len));
      if (maskKey) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      this.buf = this.buf.subarray(off + len);
      this.onFrame(fin, opcode, payload);
    }
  }
}

/**
 * LocalWebSocket — just enough of the Workers `WebSocket` surface for the
 * panel: readyState, binaryType, send/close and onopen/onmessage/onclose/onerror.
 * Two LocalWebSockets are "linked" (pair); the socket is wired to ONE end and
 * messages mirror to the other — like the platform WebSocketPair.
 */
class LocalWebSocket {
  readyState = 0; // CONNECTING
  binaryType = 'blob';
  url = null;
  protocol = null;
  extensions = null;
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;

  peer = null;
  #socket = null;
  #parser = null;
  #pending = [];
  #tx = Buffer.alloc(0);
  #txOpcode = 0;

  bindPeer(other) {
    this.peer = other;
    other.peer = this;
  }

  __wire(socket, head = Buffer.alloc(0)) {
    this.#socket = socket;
    this.readyState = 1; // OPEN
    this.#parser = new FrameParser((fin, op, pl) => this.__onFrame(fin, op, pl));
    socket.on('data', (c) => this.#parser?.push(c));
    socket.on('close', () => this.__close(1006));
    socket.on('error', () => this.__close(1006));
    // Flush anything sent before the handshake completed (the worker starts
    // the session before the harness wires the socket). Frames may have been
    // queued on either end of the pair.
    for (const f of this.#pending) socket.write(f);
    this.#pending = [];
    if (this.peer) {
      for (const f of this.peer.#pending) socket.write(f);
      this.peer.#pending = [];
    }
    if (head.length) this.#parser.push(head);
    if (this.peer?.readyState === 3) {
      // The session already closed (e.g. 407 fast-fail) — end after flush.
      socket.end();
      return;
    }
    queueMicrotask(() => this.onopen?.({}));
  }

  __onFrame(fin, opcode, payload) {
    if (opcode === OPCODE.PING) {
      this.#writeRaw(encodeFrame(OPCODE.PONG, payload));
      return;
    }
    if (opcode === OPCODE.PONG) return;
    if (opcode === OPCODE.CLOSE) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
      this.#writeRaw(encodeFrame(OPCODE.CLOSE, payload.subarray(0, 2)));
      this.__close(code);
      return;
    }
    if (opcode === OPCODE.TEXT || opcode === OPCODE.BINARY) {
      if (!fin) {
        this.#txOpcode = opcode;
        this.#tx = payload;
        return;
      }
      this.__emit(opcode, payload);
      return;
    }
    if (opcode === OPCODE.CONT) {
      this.#tx = Buffer.concat([this.#tx, payload]);
      if (fin) {
        const op = this.#txOpcode;
        const data = this.#tx;
        this.#tx = Buffer.alloc(0);
        this.__emit(op, data);
      }
    }
  }

  __emit(opcode, payload) {
    // The app-facing end (peer) decides the data type via its binaryType.
    const receiver = this.peer ?? this;
    const toData = (buf) =>
      receiver.binaryType === 'arraybuffer'
        ? new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
        : buf.toString('utf8');
    this.peer?.onmessage?.({ data: toData(payload) });
  }

  #writeRaw(buf) {
    if (this.#socket && this.#socket.writable) this.#socket.write(buf);
  }

  send(data) {
    if (this.readyState === 3) throw new Error('WebSocket is closed');
    const isStr = typeof data === 'string';
    const buf = isStr ? Buffer.from(data, 'utf8') : Buffer.from(data);
    // The pair emulates the SERVER side of the connection: frames to the
    // real (browser/client) socket are unmasked; inbound frames are masked.
    // (Like the real runtime, sends before the handshake finish are buffered.)
    const frame = encodeFrame(isStr ? OPCODE.TEXT : OPCODE.BINARY, buf, false);
    if (this.#socket) this.#writeRaw(frame);
    else if (this.peer?.#socket) this.peer.#writeRaw(frame);
    else this.#pending.push(frame);
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason, 'utf8'));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2, 'utf8');
    const frame = encodeFrame(OPCODE.CLOSE, payload);
    if (this.#socket) this.#writeRaw(frame);
    else if (this.peer?.#socket) this.peer.#writeRaw(frame);
    else this.#pending.push(frame); // flushed by __wire
    this.__close(code);
  }

  __close(code) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    try {
      this.#socket?.end();
    } catch {
      /* already closed */
    }
    this.peer?.onclose?.({ code, wasClean: true });
    this.onclose?.({ code, wasClean: true });
  }
}

/* -------- WebSocketPair + request.upgrade emulation (Workers API) ---------- */

globalThis.WebSocketPair = class {
  constructor() {
    const a = new LocalWebSocket();
    const b = new LocalWebSocket();
    a.bindPeer(b);
    this[0] = a;
    this[1] = b;
  }
};

/**
 * Emulates Workers' request.upgrade(server).
 * Node's Response cannot carry a 101 status, so the shim returns a small
 * marker object that the harness recognises and turns into a raw 101 write.
 */
Request.prototype.upgrade = function upgrade(serverSocket) {
  const key = this.headers.get('sec-websocket-key');
  if (!key) {
    return { __upgrade: true, status: 400, accept: null, __wsWiredEnd: null };
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  return {
    __upgrade: true,
    status: 101,
    accept,
    __wsWiredEnd: serverSocket, // the pair end bound to the real socket
  };
};

/* ------------------------------- HTTP server ------------------------------ */

const PORT = Number(process.env.PORT || 8787);
const env = { MOBIN_KV: new MemoryKV() };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function runWorker(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = `http://localhost:${PORT}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, String(v));
  }
  const workerReq = new Request(url, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    duplex: 'half',
  });
  try {
    return await worker.fetch(workerReq, env, ctx);
  } catch (e) {
    console.error('[local-dev] worker error:', e);
    return new Response(`worker error: ${e.message}`, { status: 500 });
  }
}

const server = http.createServer(async (req, res) => {
  const response = await runWorker(req);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
});

// WebSocket requests: node routes them to 'upgrade' instead of the request
// handler. We still run the worker (it performs auth + request.upgrade()) and
// then hand the raw socket to the pair end the worker chose.
server.on('upgrade', (req, socket, head) => {
  runWorker(req).then(async (result) => {
    // Plain Response (auth failure 407, errors…) → normal HTTP reply.
    if (result instanceof Response) {
      const buf = Buffer.from(await result.arrayBuffer());
      socket.write(
        `HTTP/1.1 ${result.status} ${result.statusText || 'Error'}\r\n` +
          `content-type: text/plain\r\ncontent-length: ${buf.length}\r\n` +
          `connection: close\r\n\r\n`,
      );
      socket.end(buf);
      return;
    }
    // Upgrade marker from the shim.
    const marker = result;
    if (!marker || !marker.__upgrade || marker.status !== 101) {
      socket.write('HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n');
      socket.end();
      return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'upgrade: websocket\r\n' +
        'connection: Upgrade\r\n' +
        `sec-websocket-accept: ${marker.accept}\r\n\r\n`,
    );
    if (marker.__wsWiredEnd) marker.__wsWiredEnd.__wire(socket, head);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ✦ Mobin Panel — local dev (in-memory KV, resets on restart)');
  console.log(`  ✦ UI:        http://localhost:${PORT}/`);
  console.log(`  ✦ API:       http://localhost:${PORT}/api/status`);
  console.log(`  ✦ Proxy:     ws://localhost:${PORT}/vless?uuid=<UUID>`);
  console.log('');
});
