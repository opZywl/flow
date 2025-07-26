"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface LanguageContextType {
  language: string
  setLanguage: (lang: string) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState("pt-br")

  const t = (key: string) => {
    // Simple translation function - you can expand this
    const translations: Record<string, Record<string, string>> = {
      "pt-br": {
        "flow.title": "Construtor de Fluxo",
        "flow.save": "Salvar",
        "flow.load": "Carregar",
        "flow.execute": "Executar",
      },
      "en-us": {
        "flow.title": "Flow Builder",
        "flow.save": "Save",
        "flow.load": "Load",
        "flow.execute": "Execute",
      },
    }

    return translations[language]?.[key] || key
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}
