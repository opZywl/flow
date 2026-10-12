"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/src/ThemeContext"

export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme()

  return (
    <button type="button" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema" className={className}>
      <Sun className="size-5 [.home-theme-light_&]:hidden" aria-hidden />
      <Moon className="hidden size-5 [.home-theme-light_&]:block" aria-hidden />
    </button>
  )
}
