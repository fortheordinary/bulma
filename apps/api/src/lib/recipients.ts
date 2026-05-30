import { z } from "@hono/zod-openapi"

// Recipients = BlindPay bank accounts (`ba_…`). BlindPay is the source of truth
// and the authoritative validator; these schemas are a client-side registry
// that (1) drives CLI prompting via GET /recipients/types, (2) does a first-pass
// validation before proxying, and (3) defines which fields to mask on read.
// Extra fields pass through to BlindPay, which rejects anything it dislikes.

const RailFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    required: z.boolean(),
    sensitive: z.boolean(),
    options: z.array(z.string()).optional(),
  })
  .openapi("RailField")

export type RailField = z.infer<typeof RailFieldSchema>

const RailSpecSchema = z
  .object({
    type: z.string(),
    label: z.string(),
    // Field whose (masked) value identifies the recipient in list output.
    primary: z.string(),
    fields: z.array(RailFieldSchema),
  })
  .openapi("RailSpec")

export type RailSpec = z.infer<typeof RailSpecSchema>

// Common to every rail (BlindPay requires `name`).
const NAME_FIELD: RailField = {
  key: "name",
  label: "Account holder name",
  required: true,
  sensitive: false,
}

function field(
  key: string,
  label: string,
  required: boolean,
  extra: {
    sensitive?: boolean
    options?: string[]
  } = {},
): RailField {
  return {
    key,
    label,
    required,
    sensitive: extra.sensitive ?? false,
    options: extra.options,
  }
}

// PIX only for now (product decision). The registry drives validation,
// /recipients/types, CLI prompting, and masking — so adding a rail later is
// just another entry here. BlindPay also supports `ach`, `wire`, `rtp`,
// `spei_bitso`, `ach_cop_bitso`, `transfers_bitso`, `international_swift`,
// `sepa`, `ted`, `pix_safe`; enable when product needs them (note: ACH/US
// rails need a `beneficiary` shape not yet confirmed against BlindPay).
export const RAILS: RailSpec[] = [
  {
    type: "pix",
    label: "Brazil PIX",
    primary: "pix_key",
    fields: [
      field("pix_key", "PIX key (CPF/CNPJ/email/phone/EVP)", true, {
        sensitive: true,
      }),
    ],
  },
]

export function railByType(type: string): RailSpec | undefined {
  return RAILS.find((r) => r.type === type)
}

function allFields(spec: RailSpec): RailField[] {
  return [NAME_FIELD, ...spec.fields]
}

function railInputSchema(spec: RailSpec): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = { type: z.literal(spec.type) }
  for (const f of allFields(spec)) {
    const base: z.ZodTypeAny =
      f.options && f.options.length > 0
        ? z.enum(f.options as [string, ...string[]])
        : z.string().min(1)
    shape[f.key] = f.required ? base : base.optional()
  }
  return z.object(shape).passthrough()
}

export type RecipientParseResult = {
  success: true
  data: Record<string, unknown>
} | {
  success: false
  error: "unsupported_rail" | "invalid_recipient"
}

/** First-pass validation: resolve the rail by `type`, then validate its fields.
 *  BlindPay re-validates and is the final authority. */
export function parseRecipientInput(body: unknown): RecipientParseResult {
  const type =
    typeof body === "object" && body !== null && "type" in body
      ? (body as { type: unknown }).type
      : undefined
  const spec = typeof type === "string" ? railByType(type) : undefined
  if (!spec) return { success: false, error: "unsupported_rail" }
  const parsed = railInputSchema(spec).safeParse(body)
  if (!parsed.success) return { success: false, error: "invalid_recipient" }
  return { success: true, data: parsed.data as Record<string, unknown> }
}

/** The fields metadata served at GET /recipients/types (name field included). */
export function railTypesMetadata(): RailSpec[] {
  return RAILS.map((spec) => ({
    type: spec.type,
    label: spec.label,
    primary: spec.primary,
    fields: allFields(spec),
  }))
}

export function maskValue(value: string): string {
  const v = value.trim()
  if (v.length <= 4) return "••••"
  return `••••${v.slice(-4)}`
}

const RecipientViewSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    name: z.string().nullable(),
    summary: z.string(),
  })
  .openapi("Recipient")

export type RecipientView = z.infer<typeof RecipientViewSchema>

/** Collapse a BlindPay bank account into a safe, masked list row. */
export function maskRecipient(account: Record<string, unknown>): RecipientView {
  const type = String(account.type ?? "")
  const spec = railByType(type)
  const name = typeof account.name === "string" ? account.name : null
  const primaryRaw = spec ? account[spec.primary] : undefined
  const label = spec?.label ?? type
  const summary =
    typeof primaryRaw === "string" && primaryRaw.length > 0
      ? `${label} ${maskValue(primaryRaw)}`
      : label
  return {
    id: String(account.id ?? ""),
    type,
    name,
    summary,
  }
}

export { RailFieldSchema, RailSpecSchema, RecipientViewSchema }
