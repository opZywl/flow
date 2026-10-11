"use client"

import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider label="Notificação">
      {toasts.map(function ({ id, title, description, action, className, variant, ...props }) {
        const destructive = variant === "destructive"
        return (
          <Toast
            key={id}
            variant={variant}
            className={cn("border-flow-border bg-flow-surface text-flow-fg", destructive && "border-flow-danger/50", className)}
            {...props}
          >
            <div className="grid gap-1">
              {title && <ToastTitle className={destructive ? "text-flow-danger" : undefined}>{title}</ToastTitle>}
              {description && (
                <ToastDescription className="text-flow-muted-strong">{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose
              aria-label="Fechar notificação"
              className="text-flow-muted hover:text-flow-fg focus:ring-flow-accent/30 group-[.destructive]:text-flow-muted group-[.destructive]:hover:text-flow-fg group-[.destructive]:focus:ring-flow-danger/30"
            />
          </Toast>
        )
      })}
      <ToastViewport label="Notificações ({hotkey})" className="sm:bottom-10 sm:left-1/2 sm:right-auto sm:-translate-x-1/2" />
    </ToastProvider>
  )
}
