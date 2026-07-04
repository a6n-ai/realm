// Compiles an admin-authored react-email component (JSX source string) to HTML,
// entirely in the admin's browser — transpile (sucrase) → eval → render(). No
// server-side eval, so admin input never executes on our infra; the worst an
// admin can do is run code in their own already-authenticated session.
//
// ponytail: new Function eval of admin source. Acceptable because it is
// admin-only and client-side; the preview is shown in a sandboxed iframe. Do
// NOT move this to the server without an isolated-vm sandbox.

export const REACT_SOURCE_MARKER = "/*react-email*/";

/** Transpile + evaluate + render a react-email component source to HTML. */
export async function compileReactEmail(source: string): Promise<string> {
  const [sucrase, reactMod, components, renderMod] = await Promise.all([
    import("sucrase"),
    import("react"),
    import("@react-email/components"),
    import("@react-email/render"),
  ]);
  const React = (reactMod as { default?: unknown }).default ?? reactMod;

  const { code } = sucrase.transform(source, {
    transforms: ["jsx", "typescript", "imports"],
    jsxRuntime: "classic",
    production: true,
  });

  // Components and React are injected as scope; `import` statements in the source
  // are stripped to no-ops by the imports transform, so the editor never pulls
  // arbitrary modules.
  const scope: Record<string, unknown> = { React, ...components };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    "module",
    "exports",
    ...Object.keys(scope),
    `${code}\nreturn module.exports.default || exports.default;`,
  );
  const Email = factory(mod, mod.exports, ...Object.values(scope));
  if (typeof Email !== "function") {
    throw new Error("Template must `export default` a component");
  }

  return (renderMod as typeof import("@react-email/render")).render(
    (React as typeof import("react")).createElement(Email as React.ComponentType),
  );
}
