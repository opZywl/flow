"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Menu, X } from "lucide-react"
import { useRouter } from "next/navigation"
import Flow from "../../flow/Flow"

export default function FlowPage() {
  const router = useRouter()
  const [showSidebar, setShowSidebar] = useState(true)
  const [actions, setActions] = useState<any>(null)

  const handleActionsReady = (flowActions: any) => {
    setActions(flowActions)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-black/90 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-gray-300 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Portfolio
            </Button>
            <div className="h-6 w-px bg-gray-700" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Workflow Builder
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-gray-300 hover:text-white"
            >
              {showSidebar ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>

            {actions && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={actions.save}
                  className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white bg-transparent"
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={actions.execute}
                  className="border-cyan-600 text-cyan-400 hover:bg-cyan-600 hover:text-white bg-transparent"
                >
                  Execute
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Workflow Builder */}
      <div className="h-[calc(100vh-73px)]">
        <Flow />
      </div>
    </div>
  )
}
