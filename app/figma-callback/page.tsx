"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

export default function FigmaCallback() {
    const searchParams = useSearchParams()

    useEffect(() => {
        const code = searchParams.get("code")
        const state = searchParams.get("state")
        const error = searchParams.get("error")

        if (error) {
            // Enviar erro para a janela pai
            window.opener?.postMessage(
                {
                    type: "FIGMA_OAUTH_ERROR",
                    error,
                },
                window.location.origin,
            )
        } else if (code && state) {
            // Enviar sucesso para a janela pai
            window.opener?.postMessage(
                {
                    type: "FIGMA_OAUTH_SUCCESS",
                    code,
                    state,
                },
                window.location.origin,
            )
        }

        // Fechar a janela popup
        window.close()
    }, [searchParams])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F24E1E] mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Processando autenticação...</h2>
                <p className="text-gray-600">Esta janela será fechada automaticamente.</p>
            </div>
        </div>
    )
}
