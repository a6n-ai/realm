import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createMiddleware, createStart } from "@tanstack/react-start";

// Every server function runs inside this, so each failure is logged once with the function's name.
const logFailures = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  try {
    return await next();
  } catch (err) {
    if (!isRedirect(err) && !isNotFound(err)) console.error(`server fn ${serverFnMeta.name} failed`, err);
    throw err;
  }
});

export const startInstance = createStart(() => ({ functionMiddleware: [logFailures] }));
