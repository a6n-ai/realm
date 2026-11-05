// Server-side stand-in for browser-only packages (next.config.ts turbopack.resolveAlias).
// Client components still compile for SSR, so their effect-only `import()`s were bundled into the
// Worker although they never run there. Importing this on the server is fine; using it is a bug.
export {};
