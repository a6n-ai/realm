// Client stand-in for `node:crypto` when webpack follows a server-only import
// into a browser bundle. `generateCode` is the only caller and is not used in
// the browser; `randomBytes` still works via Web Crypto if it is.
function randomBytes(size) {
  const buf = new Uint8Array(size);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

module.exports = { randomBytes };
