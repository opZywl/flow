"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ui } from "./ui"

export default function EraDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn(ui.dialog, "max-w-sm gap-4 rounded-xl sm:rounded-xl")}>
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base font-semibold text-flow-fg">Converter seu fluxo no padrão ERA</DialogTitle>
        </DialogHeader>
        <div className={cn(ui.card, "flex h-20 items-center justify-center bg-flow-soft")}>
          <span className="text-2xl font-bold tracking-[0.2em] text-flow-fg">ERA</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
