import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-xs font-medium transition-[color,background-color,border-color] cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--graph-ui-button-border)] bg-[var(--graph-ui-button-bg)] text-[var(--graph-ui-button-text)] hover:border-[var(--graph-ui-button-hover-border)] hover:bg-[var(--graph-ui-button-hover-bg)]",
        destructive:
          "bg-[var(--graph-ui-button-danger-bg)] text-[var(--graph-ui-button-danger-text)] hover:bg-[var(--graph-ui-button-danger-hover-bg)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-[var(--graph-ui-button-border)] bg-transparent text-[var(--graph-ui-button-text)] hover:border-[var(--graph-ui-button-hover-border)] hover:bg-[var(--graph-ui-button-hover-bg)]",
        secondary:
          "bg-[var(--graph-ui-button-bg)] text-[var(--graph-ui-button-text)] hover:bg-[var(--graph-ui-button-hover-bg)]",
        ghost:
          "bg-transparent text-[var(--graph-ui-button-ghost-text)] hover:bg-[var(--graph-ui-button-ghost-hover-bg)] hover:text-[var(--graph-ui-button-text)]",
        link: "text-[var(--graph-ui-button-link-text)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 px-2 text-[11px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 has-[>svg]:px-2",
        lg: "h-9 px-5 text-sm has-[>svg]:px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
