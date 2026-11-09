// Title: Event Calendar Content
// Description: Active-view switchboard rendering the month view; swappable per view via the components prop.

"use client"

import { type ComponentType, type HTMLAttributes, type ReactNode } from "react"
import {
  useEventCalendarSelector,
  useEventCalendarViewConfig,
} from "@/components/reui/event-calendar/event-calendar"
import { EventCalendarMonthView } from "@/components/reui/event-calendar/event-calendar-month-view"
import type { CalendarView } from "@/components/reui/event-calendar/event-calendar-types"
import { Slot } from "radix-ui"

import { cn } from "@foundry/ui/cn"

const DEFAULT_VIEW_COMPONENTS: Partial<Record<CalendarView, ComponentType>> = {
  month: EventCalendarMonthView,
}

interface EventCalendarContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Swap individual view implementations. */
  components?: Partial<Record<CalendarView, ComponentType>>
  /** Replaces the switchboard entirely; read useEventCalendarView() inside. */
  children?: ReactNode
  asChild?: boolean
}

function EventCalendarContent({
  className,
  asChild = false,
  components,
  children,
  ...props
}: EventCalendarContentProps) {
  const viewConfig = useEventCalendarViewConfig()
  const view = useEventCalendarSelector((state) => state.view)
  const loading = useEventCalendarSelector((state) => state.loading)

  const resolved = {
    ...DEFAULT_VIEW_COMPONENTS,
    ...viewConfig.components,
    ...components,
  }
  // A spread copies keys that hold `undefined`, so `components={{ month: isPro
  // ? ProMonth : undefined }}` would erase the default and render <undefined />.
  const ActiveView = resolved[view] ?? EventCalendarMonthView

  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="event-calendar-content"
      data-view={view}
      data-loading={loading || undefined}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col",
        "data-loading:pointer-events-none data-loading:opacity-60",
        viewConfig.classNames?.content,
        className
      )}
      {...props}
    >
      {children ?? <ActiveView />}
    </Comp>
  )
}

export { DEFAULT_VIEW_COMPONENTS, EventCalendarContent }
export type { EventCalendarContentProps }