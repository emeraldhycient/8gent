"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-12 w-fit items-center justify-center rounded-full p-[5px] mx-auto",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  // We read the `value` prop from primitive to key animation per tab
  const [active, setActive] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    // sync active value when component mounts (Radix will put aria-hidden accordingly)
    if (typeof (props as any).value === 'string') setActive((props as any).value)
  }, [props])

  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", "reflect-container", className)}
      {...props}
    >
      <div className="reflect-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={String((props as any).value) + ":front"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.36 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* mirror */}
      <div aria-hidden className="mt-4 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={String((props as any).value) + ":mirror"}
            initial={{ opacity: 0, y: -4, scale: 1 }}
            animate={{ opacity: 0.28, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.36 }}
            className="reflect-mirror"
          >
            {/* duplicate children for mirror effect */}
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </TabsPrimitive.Content>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
