import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const toggleGroupVariants = cva(
  "inline-flex items-center justify-center gap-0 rounded-md border border-input bg-transparent",
  {
    variants: {
      size: {
        default: "h-9",
        sm: "h-8",
        lg: "h-10"
      }
    },
    defaultVariants: { size: "default" }
  }
)

const toggleGroupItemVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 first:rounded-l-[calc(theme(borderRadius.md)-1px)] last:rounded-r-[calc(theme(borderRadius.md)-1px)] border-r last:border-r-0 border-input data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary hover:bg-accent hover:text-accent-foreground",
  {
    variants: {
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5"
      }
    },
    defaultVariants: { size: "default" }
  }
)

type ToggleGroupContextValue = VariantProps<typeof toggleGroupItemVariants>
const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({ size: "default" })

function ToggleGroup({
  className,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleGroupVariants>) {
  return (
    <ToggleGroupContext.Provider value={{ size }}>
      <ToggleGroupPrimitive.Root
        data-slot="toggle-group"
        className={cn(toggleGroupVariants({ size }), className)}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Root>
    </ToggleGroupContext.Provider>
  )
}

function ToggleGroupItem({
  className,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleGroupItemVariants>) {
  const ctx = React.useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ size: size ?? ctx.size }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
