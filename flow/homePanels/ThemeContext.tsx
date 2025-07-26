"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface ThemeContextType {
  theme: "light" | "dark"
  toggleTheme: () => void
  showColorPanel: boolean
  setShowColorPanel: (show: boolean) => void
  showSearch: boolean
  setShowSearch: (show: boolean) => void
  currentGradient: {
    primary: string
    secondary: string
    glow: string
  }
  setCurrentGradient: (gradient: any) => void
  showChannelModal: boolean
  setShowChannelModal: (show: boolean) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [currentGradient, setCurrentGradient] = useState({
    primary: "#3B82F6",
    secondary: "#8B5CF6",
    glow: "#60A5FA",
  })

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"))
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        showColorPanel,
        setShowColorPanel,
        showSearch,
        setShowSearch,
        currentGradient,
        setCurrentGradient,
        showChannelModal,
        setShowChannelModal,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
