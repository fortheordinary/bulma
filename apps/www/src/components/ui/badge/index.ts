import { cva, type VariantProps } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border text-xs font-medium transition-colors [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        brand: "border-brand/25 bg-brand/10 text-brand",
        outline: "border-border bg-background/60 text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        default: "px-3 py-1",
        sm: "px-2.5 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
