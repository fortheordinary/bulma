// Stamped at compile time via `bun build --define process.env.BULMA_VERSION=...`.
// Falls back to "dev" so unbuilt local runs (`bun run src/index.ts`) still work.
// Using `process.env.*` (already typed `string | undefined`) avoids an ambient
// `declare const`, which oxfmt mangles by stripping the `declare` keyword.
const stamped = process.env.BULMA_VERSION

export const VERSION: string =
  typeof stamped === "string" && stamped.length > 0 ? stamped : "dev"
