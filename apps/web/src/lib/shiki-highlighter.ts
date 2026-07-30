import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

export type Highlighter = HighlighterCore;

let shikiHighlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * Languages the shared highlighter loads, as explicit dynamic imports.
 *
 * Importing anything from the top-level `shiki` entry (including
 * `createHighlighter`) is what made a fresh page load pull ~200 language
 * grammars: that entry statically re-exports `langs-bundle-full`, whose every
 * entry holds a live `import()`. Rollup therefore emitted a chunk per language
 * — emacs-lisp (764K), cpp (612K), wasm (608K), wolfram (260K), and so on,
 * ~15 MB on disk — reachable from the app's statically imported editors.
 *
 * `shiki/core` has no bundle attached, so only the grammars named here ship.
 * Add a language by adding a line; nothing else pulls the full set back in.
 */
const LANGUAGE_LOADERS = {
  bash: () => import("@shikijs/langs/bash"),
  clojure: () => import("@shikijs/langs/clojure"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  csv: () => import("@shikijs/langs/csv"),
  cypher: () => import("@shikijs/langs/cypher"),
  dart: () => import("@shikijs/langs/dart"),
  diff: () => import("@shikijs/langs/diff"),
  elixir: () => import("@shikijs/langs/elixir"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  haskell: () => import("@shikijs/langs/haskell"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  makefile: () => import("@shikijs/langs/make"),
  markdown: () => import("@shikijs/langs/markdown"),
  ocaml: () => import("@shikijs/langs/ocaml"),
  perl: () => import("@shikijs/langs/perl"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  r: () => import("@shikijs/langs/r"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  terraform: () => import("@shikijs/langs/terraform"),
  toml: () => import("@shikijs/langs/toml"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} as const;

/**
 * Languages the shared highlighter supports.
 *
 * Exported so UI can answer "can we highlight this?" without importing shiki's
 * `bundledLanguages` (see above for why that is expensive). "text" is always
 * available — it needs no grammar.
 */
export const SHIKI_LANGUAGES = Object.keys(LANGUAGE_LOADERS) as Array<
  keyof typeof LANGUAGE_LOADERS
>;

export function getSharedShikiHighlighter() {
  if (!shikiHighlighterPromise) {
    shikiHighlighterPromise = createHighlighterCore({
      themes: [
        import("@shikijs/themes/github-dark"),
        import("@shikijs/themes/github-light"),
      ],
      langs: Object.values(LANGUAGE_LOADERS).map((load) => load()),
      // Oniguruma needs a WASM blob; the JS engine would be smaller but does
      // not support every grammar above.
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }

  return shikiHighlighterPromise;
}
