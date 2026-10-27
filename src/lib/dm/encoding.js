// lib/dm/encoding.js — base64url and UTF-8 helpers for the DM protocol.
// Pure JS so the same bytes come out in browsers, React Native (Hermes) and
// Node; no reliance on btoa/Buffer.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;
// Accept standard base64 too (+ / and = padding).
LOOKUP["+".charCodeAt(0)] = 62;
LOOKUP["/".charCodeAt(0)] = 63;

/** bytes → base64url, no padding. */
export function b64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

/** base64url or base64 (padding optional) → bytes. Throws on bad input. */
export function unb64(str) {
  if (typeof str !== "string") throw new TypeError("Expected a base64 string");
  const s = str.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("Invalid base64 length");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? LOOKUP[c] : -1;
    if (v < 0) throw new Error("Invalid base64 character");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

// UTF-8. Native TextEncoder/TextDecoder when the runtime has them (browsers,
// Node); a strict pure-JS codec otherwise (older Hermes lacks TextDecoder).
export function utf8Js(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function fromUtf8Js(b) {
  let s = "";
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let c;
    let need;
    let min;
    if (x < 0x80) (c = x), (need = 0), (min = 0);
    else if (x >= 0xc2 && x < 0xe0) (c = x & 31), (need = 1), (min = 0x80);
    else if (x >= 0xe0 && x < 0xf0) (c = x & 15), (need = 2), (min = 0x800);
    else if (x >= 0xf0 && x < 0xf5) (c = x & 7), (need = 3), (min = 0x10000);
    else throw new TypeError("Invalid UTF-8");
    for (let k = 0; k < need; k++) {
      const y = b[i++];
      if (y === undefined || (y & 0xc0) !== 0x80) throw new TypeError("Invalid UTF-8");
      c = (c << 6) | (y & 63);
    }
    if (c < min || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) throw new TypeError("Invalid UTF-8");
    s += String.fromCodePoint(c);
  }
  return s;
}

const enc = typeof TextEncoder === "function" ? new TextEncoder() : null;
const dec = typeof TextDecoder === "function" ? new TextDecoder("utf-8", { fatal: true }) : null;

export const utf8 = (s) => (enc ? enc.encode(s) : utf8Js(s));
export const fromUtf8 = (b) => (dec ? dec.decode(b) : fromUtf8Js(b));

/** Constant-time byte comparison. */
export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
