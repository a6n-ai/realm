// The `server-only` guard throws outside Next's react-server build; these scripts are server-side.
const Module = require("node:module");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? __filename : resolve.call(this, request, ...rest);
};
