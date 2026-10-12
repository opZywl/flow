"use client"

import { Fragment, useMemo } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { ui } from "./ui"

export type FlowSelectOption = {
  value: string
  label: string
  disabled?: boolean
  group?: string
}

type FlowSelectProps = {
  value: string
  onValueChange: (value: string) => void
  options: ReadonlyArray<FlowSelectOption>
  placeholder?: string
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
  disabled?: boolean
  className?: string
}

const EMPTY = "__flow-select-empty__"

const toInner = (value: string) => (value === "" ? EMPTY : value)
const toOuter = (value: string) => (value === EMPTY ? "" : value)

const trigger =
  "nokey group flex items-center justify-between gap-2 pl-2.5 pr-2 text-left disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-flow-muted [&>span]:min-w-0 [&>span]:truncate"
const openTrigger = "data-[state=open]:border-flow-accent data-[state=open]:ring-2 data-[state=open]:ring-flow-accent/25"
const content =
  "nokey relative z-[200] max-h-[min(var(--radix-select-content-available-height),18rem)] min-w-[var(--radix-select-trigger-width)] max-w-[min(var(--radix-select-content-available-width),32rem)] overflow-hidden rounded-lg border border-flow-border bg-flow-surface text-flow-fg shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none"
const item =
  "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-2.5 pr-8 text-sm text-flow-fg outline-none transition-colors hover:bg-flow-soft data-[highlighted]:bg-flow-soft data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:cursor-default data-[disabled]:opacity-45"
const scroller = "flex h-6 cursor-default items-center justify-center bg-flow-surface text-flow-muted"

type Section = { group?: string; options: FlowSelectOption[] }

function sectionsOf(options: ReadonlyArray<FlowSelectOption>) {
  const sections: Section[] = []
  for (const option of options) {
    const last = sections[sections.length - 1]
    if (last && last.group === option.group) last.options.push(option)
    else sections.push({ group: option.group, options: [option] })
  }
  return sections
}

export function FlowSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  disabled,
  className,
}: FlowSelectProps) {
  const sections = useMemo(() => sectionsOf(options), [options])
  const selected = options.find((option) => option.value === value)
  const inner = selected ? toInner(value) : value
  const isInvalid = invalid === true || invalid === "true"

  return (
    <SelectPrimitive.Root
      value={inner}
      onValueChange={(next) => {
        if (next === "") return
        const outer = toOuter(next)
        if (outer !== value) onValueChange(outer)
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(ui.select, trigger, !isInvalid && openTrigger, !selected && "text-flow-muted", className)}
      >
        <SelectPrimitive.Value placeholder={placeholder}>{selected ? selected.label : (placeholder ?? "")}</SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-flow-muted transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" side="bottom" align="start" sideOffset={4} collisionPadding={8} className={content}>
          <SelectPrimitive.ScrollUpButton className={scroller}>
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {sections.length === 0 ? (
              <div className="px-2.5 py-1.5 text-sm text-flow-muted">Nenhuma opção disponível</div>
            ) : (
              sections.map((section, index) => (
                <Fragment key={`${index}-${section.group ?? ""}`}>
                  {index > 0 ? <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-flow-border" /> : null}
                  {section.group ? (
                    <SelectPrimitive.Group>
                      <SelectPrimitive.Label className={cn(ui.sectionTitle, "px-2.5 pb-1 pt-1.5")}>{section.group}</SelectPrimitive.Label>
                      {section.options.map((option) => (
                        <FlowSelectItem key={option.value} option={option} />
                      ))}
                    </SelectPrimitive.Group>
                  ) : (
                    section.options.map((option) => <FlowSelectItem key={option.value} option={option} />)
                  )}
                </Fragment>
              ))
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={scroller}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

function FlowSelectItem({ option }: { option: FlowSelectOption }) {
  return (
    <SelectPrimitive.Item value={toInner(option.value)} disabled={option.disabled} textValue={option.label} className={item}>
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex h-4 w-4 items-center justify-center text-flow-accent">
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
