import { createInterface } from "node:readline/promises"
import { z } from "zod"
import { loadCredentials, type Credentials } from "../lib/credentials"

const RailField = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  sensitive: z.boolean(),
  options: z.array(z.string()).optional(),
})
const RailSpec = z.object({
  type: z.string(),
  label: z.string(),
  primary: z.string(),
  fields: z.array(RailField),
})
const RecipientView = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().nullable(),
  summary: z.string(),
})

type RailSpecT = z.infer<typeof RailSpec>

type RecipientOptions = {
  json?: boolean
}

function authHeaders(creds: Credentials): Record<string, string> {
  return { Authorization: `Bearer ${creds.sessionToken}` }
}

function parseSetFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1]
    if (args[i] === "--set" && next) {
      const eq = next.indexOf("=")
      if (eq > 0) out[next.slice(0, eq)] = next.slice(eq + 1)
      i++
    }
  }
  return out
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : undefined
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

async function fetchTypes(creds: Credentials): Promise<RailSpecT[]> {
  const res = await fetch(`${creds.apiUrl}/recipients/types`, {
    headers: authHeaders(creds),
  })
  if (!res.ok) throw new Error(`recipients/types failed: ${res.status}`)
  return z.array(RailSpec).parse(await res.json())
}

async function add(
  creds: Credentials,
  args: string[],
  opts: RecipientOptions,
): Promise<number> {
  const specs = await fetchTypes(creds)
  const interactive = Boolean(process.stdin.isTTY)

  let type = flagValue(args, "type")
  if (!type && interactive) {
    console.log("Recipient types:")
    specs.forEach((s, i) => console.log(`  ${i + 1}. ${s.label} (${s.type})`))
    const pick = await promptLine("Select type [number]: ")
    type = specs[Number(pick) - 1]?.type
  }
  const spec = specs.find((s) => s.type === type)
  if (!spec) {
    console.error(
      `Unknown or missing --type. Available: ${specs.map((s) => s.type).join(", ")}`,
    )
    return 2
  }

  const set = parseSetFlags(args)
  const nameFlag = flagValue(args, "name")
  if (nameFlag) set.name = nameFlag

  const body: Record<string, string> = { type: spec.type }
  for (const f of spec.fields) {
    let value = set[f.key]
    if (value === undefined && interactive) {
      const opt = f.options ? ` (${f.options.join("/")})` : ""
      const req = f.required ? "" : " [optional]"
      value = await promptLine(`${f.label}${opt}${req}: `)
    }
    if (value !== undefined && value !== "") body[f.key] = value
    if (f.required && !body[f.key]) {
      console.error(`Missing required field: ${f.key} (--set ${f.key}=…)`)
      return 2
    }
  }

  const res = await fetch(`${creds.apiUrl}/recipients`, {
    method: "POST",
    headers: { ...authHeaders(creds), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.status === 404) {
    console.error("No account yet. Run `bulma onboard` first.")
    return 4
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const detail =
      typeof err === "object" && err !== null && "detail" in err
        ? ` — ${(err as { detail?: string }).detail}`
        : ""
    console.error(`Could not add recipient (${res.status})${detail}`)
    return 10
  }
  const created = RecipientView.parse(await res.json())
  if (opts.json) {
    console.log(JSON.stringify(created, null, 2))
    return 0
  }
  console.log(`✓ Added ${created.summary}  [${created.id}]`)
  return 0
}

async function list(
  creds: Credentials,
  opts: RecipientOptions,
): Promise<number> {
  const res = await fetch(`${creds.apiUrl}/recipients`, {
    headers: authHeaders(creds),
  })
  if (res.status === 404) {
    console.error("No account yet. Run `bulma onboard` first.")
    return 4
  }
  if (!res.ok) {
    console.error(`recipient list failed: ${res.status}`)
    return 10
  }
  const rows = z.array(RecipientView).parse(await res.json())
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2))
    return 0
  }
  if (rows.length === 0) {
    console.log("No recipients yet. Add one with `bulma recipient add`.")
    return 0
  }
  console.log("Recipients")
  console.log("==========")
  for (const r of rows) {
    console.log(`${r.summary}`)
    console.log(`  ${r.name ?? "—"}  [${r.id}]`)
  }
  return 0
}

async function fields(
  creds: Credentials,
  args: string[],
  opts: RecipientOptions,
): Promise<number> {
  const specs = await fetchTypes(creds)
  const type = flagValue(args, "type")

  if (!type) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          specs.map((s) => ({ type: s.type, label: s.label })),
          null,
          2,
        ),
      )
      return 0
    }
    console.log("Recipient types:")
    for (const s of specs) console.log(`  ${s.type}  — ${s.label}`)
    console.log("\nRun `bulma recipient fields --type <type>` for its fields.")
    return 0
  }

  const spec = specs.find((s) => s.type === type)
  if (!spec) {
    console.error(
      `Unknown --type. Available: ${specs.map((s) => s.type).join(", ")}`,
    )
    return 2
  }

  if (opts.json) {
    console.log(JSON.stringify(spec, null, 2))
    return 0
  }
  console.log(`${spec.label} (${spec.type})`)
  for (const f of spec.fields) {
    const req = f.required ? "required" : "optional"
    const sens = f.sensitive ? ", sensitive" : ""
    const choices = f.options ? ` [${f.options.join("/")}]` : ""
    console.log(`  --set ${f.key}=…  ${f.label} (${req}${sens})${choices}`)
  }
  return 0
}

async function remove(creds: Credentials, id: string): Promise<number> {
  if (!id) {
    console.error("Usage: bulma recipient remove <id>")
    return 2
  }
  const res = await fetch(`${creds.apiUrl}/recipients/${id}`, {
    method: "DELETE",
    headers: authHeaders(creds),
  })
  if (res.status === 404) {
    console.error("No account, or recipient not found.")
    return 4
  }
  if (!res.ok) {
    console.error(`recipient remove failed: ${res.status}`)
    return 10
  }
  console.log(`✓ Removed ${id}`)
  return 0
}

export async function recipient(args: string[]): Promise<number> {
  const creds = await loadCredentials()
  if (!creds) {
    console.error("Not logged in. Run `bulma login`.")
    return 3
  }
  const sub = args[0]
  const rest = args.slice(1)
  const opts: RecipientOptions = { json: rest.includes("--json") }

  switch (sub) {
    case "add":
      return add(creds, rest, opts)
    case "list":
      return list(creds, opts)
    case "fields":
      return fields(creds, rest, opts)
    case "remove":
    case "rm":
      return remove(creds, rest[0] ?? "")
    default:
      console.error("Usage: bulma recipient <add|list|fields|remove> [...]")
      return 2
  }
}
