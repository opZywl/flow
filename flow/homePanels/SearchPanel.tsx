"use client"

import { useTheme } from "./ThemeContext"

export default function SearchPanel() {
  const { theme, setShowSearch } = useTheme()

  return (
    <div
      className={`fixed right-4 top-20 w-80 p-4 rounded-lg border ${
        theme === "dark" ? "bg-black border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className={`font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>Search Panel</h3>
        <button
          onClick={() => setShowSearch(false)}
          className={`text-sm ${theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}
        >
          ✕
        </button>
      </div>
      <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
        Search functionality will be available here.
      </p>
    </div>
  )
}
