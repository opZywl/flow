"use client"

import type React from "react"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import {
  FiArrowLeft,
  FiSearch,
  FiSave,
  FiPlayCircle,
  FiDownload,
  FiSun,
  FiMoon,
  FiZoomIn,
  FiZoomOut,
  FiMaximize,
  FiRefreshCw,
  FiMapPin,
  FiLayers,
  FiSidebar,
  FiCheckCircle,
  FiXCircle,
} from "react-icons/fi"
import { BotIcon } from "lucide-react"

// Componente do Indicador de Status
const FlowStatusIndicator = ({ startPosition, mousePosition, componentCount, theme }: any) => {
  const isDark = theme === "dark"
  const [isExecuted, setIsExecuted] = useState(false)

  useEffect(() => {
    const executedFlow = localStorage.getItem("executedFlow")
    setIsExecuted(executedFlow === "true")
  }, [])

  useEffect(() => {
    const handleStorageChange = () => {
      const executedFlow = localStorage.getItem("executedFlow")
      setIsExecuted(executedFlow === "true")
    }

    window.addEventListener("storage", handleStorageChange)
    const interval = setInterval(handleStorageChange, 1000)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      clearInterval(interval)
    }
  }, [])

  return (
    <div
      className={`flex items-center gap-4 px-3 py-1.5 rounded-lg border text-xs transition-all duration-200 ${
        isDark
          ? "bg-black hover:bg-gray-900 border border-gray-800 hover:border-gray-700 text-white"
          : "bg-gray-50 hover:bg-white border border-gray-200 hover:border-gray-300 text-gray-900"
      }`}
    >
      <div className="flex items-center gap-1">
        {isExecuted ? (
          <FiCheckCircle className="h-3 w-3 text-green-500" />
        ) : (
          <FiXCircle className="h-3 w-3 text-red-500" />
        )}
        <span className="font-semibold">{isExecuted ? "EXECUTADO" : "NÃO EXECUTADO"}</span>
      </div>

      <div className={`w-px h-4 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

      <div className="flex items-center gap-1">
        <FiMapPin className="h-3 w-3 text-blue-500" />
        <span className="font-mono">
          INÍCIO: ({Math.round(startPosition.x)}, {Math.round(startPosition.y)})
        </span>
      </div>

      <div className={`w-px h-4 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

      <div className="flex items-center gap-1">
        <span className="text-purple-500">🖱️</span>
        <span className="font-mono">
          Mouse: ({Math.round(mousePosition.x)}, {Math.round(mousePosition.y)})
        </span>
      </div>

      <div className={`w-px h-4 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

      <div className="flex items-center gap-1">
        <FiLayers className="h-3 w-3 text-orange-500" />
        <span>
          <span className="font-semibold">{componentCount}</span> componentes
        </span>
      </div>
    </div>
  )
}

// Flow Header
const FlowHeader = ({
  onSave,
  onExecute,
  onReset,
  onDownload,
  onToggleSidebar,
  startPosition,
  mousePosition,
  componentCount,
}: any) => {
  const router = useRouter()
  const [theme, setTheme] = useState("dark")
  const [searchValue, setSearchValue] = useState("")
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showExecuteDialog, setShowExecuteDialog] = useState(false)

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchValue.trim()) {
      // Implementar busca
    }
  }

  const handleReset = () => {
    setShowResetDialog(true)
  }

  const confirmReset = () => {
    if (onReset) {
      onReset()
    }
    setShowResetDialog(false)
  }

  const handleExecute = () => {
    if (onExecute) {
      onExecute()
      setShowExecuteDialog(true)
    }
  }

  const isDark = theme === "dark"

  return (
    <>
      <header
        className={`flex items-center justify-between p-4 border-b ${
          isDark ? "bg-black border-gray-800" : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
              isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
          >
            <FiArrowLeft />
          </button>

          <button
            onClick={onToggleSidebar}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
              isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
            title="Mostrar/Ocultar Componentes"
          >
            <FiSidebar />
          </button>

          <div className="flex items-center gap-2">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative">
                <FiSearch
                  className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${
                    isDark ? "text-gray-400" : "text-gray-500"
                  }`}
                />
                <Input
                  type="text"
                  placeholder="Buscar por ID..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className={`w-48 h-8 text-sm pl-10 ${
                    isDark
                      ? "bg-black border-gray-700 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>
            </form>

            <button
              className={`p-2 rounded-md transition-colors ${
                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
              }`}
              title="Diminuir Zoom"
            >
              <FiZoomOut />
            </button>
            <button
              className={`p-2 rounded-md transition-colors ${
                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
              }`}
              title="Aumentar Zoom"
            >
              <FiZoomIn />
            </button>
            <button
              className={`p-2 rounded-md transition-colors ${
                isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
              }`}
              title="Ajustar à Tela"
            >
              <FiMaximize />
            </button>
          </div>

          <FlowStatusIndicator
            startPosition={startPosition}
            mousePosition={mousePosition}
            componentCount={componentCount}
            theme={theme}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isDark
                ? "hover:bg-gray-800 text-gray-300 border border-gray-700"
                : "hover:bg-gray-50 text-gray-700 border border-gray-300"
            }`}
            title="Salvar Fluxo"
          >
            <FiSave className="inline mr-1" />
            Salvar
          </button>

          <button
            onClick={handleReset}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isDark
                ? "hover:bg-red-900 text-red-300 border border-red-700"
                : "hover:bg-red-50 text-red-700 border border-red-300"
            }`}
            title="Resetar Fluxo"
          >
            <FiRefreshCw className="inline mr-1" />
            Resetar
          </button>

          <button
            onClick={onDownload}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isDark
                ? "hover:bg-green-900 text-green-300 border border-green-700"
                : "hover:bg-green-50 text-green-700 border border-green-300"
            }`}
            title="Download do Fluxo"
          >
            <FiDownload className="inline mr-1" />
            Download
          </button>

          <button
            onClick={handleExecute}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isDark
                ? "hover:bg-blue-900 text-blue-300 border border-blue-700"
                : "hover:bg-blue-50 text-blue-700 border border-blue-300"
            }`}
            title="Executar Fluxo"
          >
            <FiPlayCircle className="inline mr-1" />
            Executar
          </button>

          <div className={`w-px h-6 mx-2 ${isDark ? "bg-gray-700" : "bg-gray-300"}`} />

          <button
            onClick={toggleTheme}
            className={`p-2 rounded-md transition-colors ${
              isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
            title={isDark ? "Modo Claro" : "Modo Escuro"}
          >
            {isDark ? <FiSun /> : <FiMoon />}
          </button>

          <button
            className={`p-2 rounded-md transition-colors ${
              isDark ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
            }`}
            title="Aura Assistente de IA"
          >
            <BotIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Dialog de Reset */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="bg-black border-gray-700 max-w-md mx-auto rounded-xl">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold text-white flex items-center justify-center gap-2">
              <FiRefreshCw className="h-6 w-6 text-red-500" />
              Resetar Fluxo
            </DialogTitle>
            <DialogDescription className="text-gray-300 mt-2">
              ⚠️ Esta ação irá remover <strong>todos os componentes</strong>.
              <br />
              <span className="text-red-500 font-semibold">Esta ação não pode ser desfeita!</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button onClick={confirmReset} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
              <FiRefreshCw className="inline mr-1" />
              Resetar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Fluxo Executado */}
      <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <DialogContent className="bg-black border-gray-700 max-w-md mx-auto rounded-xl">
          <DialogHeader className="text-center">
            <DialogTitle className="text-2xl font-bold text-white flex items-center justify-center gap-3">
              🚀 Fluxo Executado!
            </DialogTitle>
            <DialogDescription className="text-gray-300 mt-3 text-center text-lg">
              ✅ <strong>Sucesso!</strong> Seu fluxo foi executado e está ativo!
              <br />
              <span className="text-sm mt-2 block">
                🤖 Agora o <strong>bot Aura</strong> pode usar este fluxo para conversar
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-6">
            <Button
              onClick={() => setShowExecuteDialog(false)}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-2"
            >
              🎉 Perfeito!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Componente principal simplificado sem ReactFlow
const Flow = () => {
  const [mounted, setMounted] = useState(false)
  const [startPosition] = useState({ x: 250, y: 100 })
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [componentCount] = useState(1)
  const [showSidebar, setShowSidebar] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleSidebar = useCallback(() => {
    setShowSidebar(!showSidebar)
  }, [showSidebar])

  const handleSave = () => {
    localStorage.setItem("workflow", JSON.stringify({ saved: true }))
    alert("Fluxo salvo com sucesso!")
  }

  const handleExecute = () => {
    localStorage.setItem("executedFlow", "true")
    return true
  }

  const handleReset = () => {
    localStorage.removeItem("workflow")
    localStorage.removeItem("executedFlow")
    alert("Fluxo resetado!")
  }

  const handleDownload = () => {
    alert("Download iniciado!")
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-lg">Carregando Construtor de Fluxo...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      <FlowHeader
        onSave={handleSave}
        onExecute={handleExecute}
        onReset={handleReset}
        onDownload={handleDownload}
        onToggleSidebar={toggleSidebar}
        startPosition={startPosition}
        mousePosition={mousePosition}
        componentCount={componentCount}
      />

      <main className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {showSidebar && (
            <div className="w-64 border-r border-gray-800 bg-black p-4">
              <h2 className="text-lg font-semibold text-white mb-4">Componentes</h2>
              <div className="space-y-2">
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-white">
                  <div className="font-medium">📤 Enviar Mensagem</div>
                  <div className="text-sm text-gray-400">Envia uma mensagem para o usuário</div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-white">
                  <div className="font-medium">🔀 Opções</div>
                  <div className="text-sm text-gray-400">Apresenta opções para o usuário escolher</div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-white">
                  <div className="font-medium">⚙️ Processar</div>
                  <div className="text-sm text-gray-400">Processa dados ou executa lógica</div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-white">
                  <div className="font-medium">❓ Condicional</div>
                  <div className="text-sm text-gray-400">Toma decisões baseadas em condições</div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-white">
                  <div className="font-medium">💻 Código</div>
                  <div className="text-sm text-gray-400">Executa código personalizado</div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-white">
                  <div className="font-medium">🏁 Finalizar</div>
                  <div className="text-sm text-gray-400">Finaliza o fluxo de conversação</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 bg-gray-900 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-6xl mb-4">🚀</div>
                <h2 className="text-2xl font-bold mb-2">Workflow Builder</h2>
                <p className="text-gray-400 mb-6">Construa fluxos de conversação inteligentes para seu bot</p>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="text-purple-400 text-2xl mb-2">🎯</div>
                    <div className="font-medium">Visual</div>
                    <div className="text-sm text-gray-400">Interface drag & drop</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="text-cyan-400 text-2xl mb-2">⚡</div>
                    <div className="font-medium">Rápido</div>
                    <div className="text-sm text-gray-400">Execução em tempo real</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="text-green-400 text-2xl mb-2">🔧</div>
                    <div className="font-medium">Flexível</div>
                    <div className="text-sm text-gray-400">Totalmente customizável</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="text-orange-400 text-2xl mb-2">🤖</div>
                    <div className="font-medium">IA</div>
                    <div className="text-sm text-gray-400">Powered by AI</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Flow
