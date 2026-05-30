import { Database } from "bun:sqlite"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Minimal D1Database shim over `bun:sqlite` for route-level tests. Implements
 * exactly the surface `drizzle-orm/d1` calls: `prepare(sql).bind(...params)`
 * returning `{ all, raw, run, first }`, plus `batch`/`exec`. The shape of each
 * result (`{ results }`, `meta.changes`) matches what the D1 driver expects, so
 * the real route handlers run against real SQLite — only the binding differs.
 */
function makeD1(sqlite: Database): D1Database {
  const bound = (sql: string, params: unknown[]) => {
    const q = sqlite.prepare(sql)
    return {
      // biome-ignore lint: variadic SQLite params are unknown by nature
      all: async () => ({
        results: q.all(...params as any[]),
        success: true,
        meta: {},
      }),
      // biome-ignore lint: see above
      raw: async () => q.values(...params as any[]),
      run: async () => {
        // biome-ignore lint: see above
        const r = q.run(...params as any[])
        return {
          success: true,
          meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) },
        }
      },
      first: async (col?: string) => {
        // biome-ignore lint: see above
        const row = q.get(...params as any[]) as Record<string, unknown> | null
        if (col) return row ? (row[col] ?? null) : null
        return row ?? null
      },
    }
  }

  const prepare = (sql: string) => ({
    bind: (...params: unknown[]) => bound(sql, params),
    // Statements drizzle batches are pre-bound; these are unused but part of the
    // D1PreparedStatement surface.
    all: async () => ({
      results: sqlite.prepare(sql).all(),
      success: true,
      meta: {},
    }),
    raw: async () => sqlite.prepare(sql).values(),
    run: async () => {
      const r = sqlite.prepare(sql).run()
      return {
        success: true,
        meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) },
      }
    },
    first: async () => sqlite.query(sql).get() ?? null,
  })

  return {
    prepare,
    batch: async (stmts: Array<{ all: () => Promise<unknown> }>) => {
      const out: unknown[] = []
      for (const s of stmts) out.push(await s.all())
      return out
    },
    exec: async (sql: string) => {
      sqlite.exec(sql)
      return { count: 0, duration: 0 }
    },
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database
}

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "migrations")

/** Fresh in-memory D1 with every migration applied, in filename order. */
export function freshDb(): {
  sqlite: Database
  DB: D1Database
} {
  const sqlite = new Database(":memory:")
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  for (const f of files) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  }
  return { sqlite, DB: makeD1(sqlite) }
}
