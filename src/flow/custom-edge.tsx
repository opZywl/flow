"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const EdgeActionsContext = createContext<{ remove?: (id: string) => void }>({})

const PATH_STYLE: CSSProperties = { stroke: "rgb(var(--flow-accent) / 0.55)", strokeWidth: 2.25, transition: "stroke-width 0.15s ease" }
const PATH_ACTIVE_STYLE: CSSProperties = { ...PATH_STYLE, strokeWidth: 3 }
const DASH_STYLE: CSSProperties = { stroke: "rgb(var(--flow-accent))", strokeWidth: 2, strokeLinecap: "round", opacity: 0.75 }
const DASH_ACTIVE_STYLE: CSSProperties = { ...DASH_STYLE, strokeWidth: 2.5, opacity: 1 }

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerStart,
  markerEnd,
}: EdgeProps) {
  const { remove } = useContext(EdgeActionsContext)
  const group = useRef<SVGGElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [path, labelX, labelY] = useMemo(
    () => getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }),
    [sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY],
  )

  useEffect(() => {
    const wrapper = group.current?.closest(".react-flow__edge")
    if (!wrapper) return
    const focus = () => setFocused(true)
    const blur = () => setFocused(false)
    wrapper.addEventListener("focus", focus)
    wrapper.addEventListener("blur", blur)
    return () => {
      wrapper.removeEventListener("focus", focus)
      wrapper.removeEventListener("blur", blur)
    }
  }, [])

  const enter = useCallback(() => setHovered(true), [])
  const leave = useCallback(() => setHovered(false), [])
  const removeEdge = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      remove?.(id)
    },
    [id, remove],
  )

  const active = hovered || focused || Boolean(selected)
  const label = typeof data?.label === "string" || typeof data?.label === "number" ? String(data.label) : ""
  const removable = active && Boolean(remove)

  return (
    <g ref={group} onMouseEnter={enter} onMouseLeave={leave}>
      <path
        id={id}
        d={path}
        fill="none"
        className={cn("react-flow__edge-path", active && "flow-edge-glow")}
        style={active ? PATH_ACTIVE_STYLE : PATH_STYLE}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />
      <path d={path} fill="none" className="flow-edge-dash pointer-events-none" style={active ? DASH_ACTIVE_STYLE : DASH_STYLE} />
      <path d={path} fill="none" stroke="transparent" strokeWidth={22} className="react-flow__edge-interaction" />
      {(label || removable) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1.5"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          >
            {label && (
              <span className="rounded-md border border-flow-border bg-flow-surface px-2 py-0.5 text-[11px] font-semibold text-flow-muted-strong shadow-sm">{label}</span>
            )}
            {removable && (
              <button
                type="button"
                aria-label="Remover conexão"
                title="Remover conexão"
                onClick={removeEdge}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-flow-danger/50 bg-flow-surface text-flow-danger shadow-sm transition hover:border-flow-danger hover:bg-flow-danger hover:text-flow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-danger/40"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}
