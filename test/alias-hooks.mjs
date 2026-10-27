// Module hooks for node --test: resolve the "@/..." alias to src/, and swap
// modules that need a browser or Firebase for small stand-ins.
const SRC = new URL("../src/", import.meta.url);
const STUBS = {
  "@/lib/api": "export const api = { publicGet: async () => null, get: async () => null, post: async () => ({}), put: async () => ({}), del: async () => ({}) };",
};
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const url = new URL(specifier.slice(2), SRC);
    for (const ext of ["", ".js", "/index.js"]) {
      try {
        return await next(url.href + ext, context);
      } catch {}
    }
  }
  // src/ uses extensionless relative imports (bundler style).
  if (specifier.startsWith(".") && context.parentURL?.startsWith(SRC.href) && !/\.\w+$/.test(specifier)) {
    try {
      return await next(specifier + ".js", context);
    } catch {}
  }
  return next(specifier, context);
}
