/**
 * The public site's own vocabulary (PLAN Phase 9.3/9.4).
 *
 * Deliberately separate from `locales/*.json`: the marketing pages are
 * Spanish-first firm copy with no language switch and no session, and folding
 * them into the app's dictionaries would make every app string a page the
 * apex could render.
 */

export * from "./firm";
export * from "./guides";
export * from "./pages";
export * from "./seo";
export * from "./services";
