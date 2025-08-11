"use client"

import type React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import {
    FiX,
    FiZap,
    FiMessageSquare,
    FiLayers,
    FiSend,
    FiSlack,
    FiMail,
    FiGlobe,
    FiTwitter,
    FiInstagram,
} from "react-icons/fi"
import BlipIntegration from "./BliP"
import FigmaIntegration from "./FigmaIntegration"

interface IntegrationsMenuProps {
    isOpen: boolean
    onClose: () => void
    theme: string
    currentGradient: any
}

const IntegrationsMenu: React.FC<IntegrationsMenuProps> = ({ isOpen, onClose, theme, currentGradient }) => {
    const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null)

    const isDark = theme === "dark"

    const integrations = [
        {
            id: "blip",
            name: "BliP",
            description: "Plataforma de chatbots e automação conversacional",
            icon: FiMessageSquare,
            color: "#00D4FF",
            category: "CHATBOT",
            status: "active",
            isActive: true,
            logoPath: "/icons/blip.png",
        },
        {
            id: "figma",
            name: "Figma",
            description: "Design colaborativo e prototipagem de fluxos",
            icon: FiLayers,
            color: "#F24E1E",
            category: "DESIGN",
            status: "active",
            isActive: true,
            logoPath: "/icons/figma.png",
        },
        {
            id: "telegram",
            name: "Telegram",
            description: "Bot para Telegram com API oficial",
            icon: FiSend,
            color: "#0088CC",
            category: "MESSAGING",
            status: "coming-soon",
            isActive: false,
        },
        {
            id: "slack",
            name: "Slack",
            description: "Integração com workspace do Slack",
            icon: FiSlack,
            color: "#4A154B",
            category: "WORKSPACE",
            status: "coming-soon",
            isActive: false,
        },
        {
            id: "email",
            name: "Email Marketing",
            description: "Automação de email marketing",
            icon: FiMail,
            color: "#EA4335",
            category: "MARKETING",
            status: "coming-soon",
            isActive: false,
        },
        {
            id: "widget",
            name: "Website Widget",
            description: "Widget de chat para seu website",
            icon: FiGlobe,
            color: "#FF6900",
            category: "WEB",
            status: "coming-soon",
            isActive: false,
        },
        {
            id: "twitter",
            name: "Twitter/X",
            description: "Automação para Twitter/X",
            icon: FiTwitter,
            color: "#1DA1F2",
            category: "SOCIAL",
            status: "coming-soon",
            isActive: false,
        },
        {
            id: "instagram",
            name: "Instagram",
            description: "Integração com Instagram Business",
            icon: FiInstagram,
            color: "#E4405F",
            category: "SOCIAL",
            status: "coming-soon",
            isActive: false,
        },
    ]

    const handleIntegrationClick = (integration: any) => {
        if (integration.isActive) {
            setSelectedIntegration(integration.id)
        }
    }

    const closeIntegrationModal = () => {
        setSelectedIntegration(null)
    }

    if (!isOpen) return null

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]" onClick={onClose} />

            {/* Main Modal */}
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl"
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, rgba(0,0,0,0.98) 0%, rgba(15,15,15,0.98) 50%, rgba(0,0,0,0.98) 100%)`
                            : `linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 50%, rgba(255,255,255,0.98) 100%)`,
                        border: isDark ? `2px solid ${currentGradient.glow}60` : `2px solid ${currentGradient.primary}40`,
                        boxShadow: isDark
                            ? `0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 60px ${currentGradient.glow}40, inset 0 1px 0 rgba(255,255,255,0.1)`
                            : `0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 60px ${currentGradient.primary}30, inset 0 1px 0 rgba(255,255,255,0.8)`,
                        backdropFilter: "blur(25px)",
                    }}
                >
                    {/* Background Pattern */}
                    <div
                        className="absolute inset-0 opacity-10 rounded-2xl"
                        style={{
                            backgroundImage: isDark
                                ? `radial-gradient(circle at 20% 30%, ${currentGradient.primary}80 0%, transparent 40%), 
                   radial-gradient(circle at 80% 70%, ${currentGradient.secondary}80 0%, transparent 40%),
                   radial-gradient(circle at 50% 50%, ${currentGradient.accent}60 0%, transparent 60%)`
                                : `radial-gradient(circle at 20% 30%, ${currentGradient.primary}60 0%, transparent 40%), 
                   radial-gradient(circle at 80% 70%, ${currentGradient.secondary}60 0%, transparent 40%),
                   radial-gradient(circle at 50% 50%, ${currentGradient.accent}40 0%, transparent 60%)`,
                        }}
                    />

                    {/* Header */}
                    <div
                        className="relative z-10 p-6 border-b"
                        style={{
                            borderColor: isDark ? `${currentGradient.glow}40` : `${currentGradient.primary}30`,
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.8), rgba(15,15,15,0.6))`
                                : `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(248,250,252,0.6))`,
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div
                                    className="p-3 rounded-xl"
                                    style={{
                                        background: `linear-gradient(135deg, ${currentGradient.primary}, ${currentGradient.secondary})`,
                                        boxShadow: `0 8px 20px ${currentGradient.glow}40`,
                                    }}
                                >
                                    <FiZap
                                        className="w-6 h-6 text-white"
                                        style={{
                                            filter: `drop-shadow(0 0 8px ${currentGradient.glow}60)`,
                                        }}
                                    />
                                </div>
                                <div>
                                    <h2
                                        className="text-2xl font-bold mb-1"
                                        style={{
                                            color: isDark ? "#ffffff" : "#111827",
                                            textShadow: isDark
                                                ? `0 0 15px ${currentGradient.glow}60`
                                                : `0 0 8px ${currentGradient.primary}40`,
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Integrações Disponíveis
                                    </h2>
                                    <p
                                        className="text-sm"
                                        style={{
                                            color: isDark ? "#e5e7eb" : "#4b5563",
                                            textShadow: isDark ? `0 0 5px ${currentGradient.glow}30` : "none",
                                            fontFamily: "system-ui, -apple-system, sans-serif",
                                        }}
                                    >
                                        Conecte seu fluxo com diferentes plataformas e serviços
                                    </p>
                                </div>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onClose}
                                className="p-2 rounded-xl transition-colors"
                                style={{
                                    background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                    color: isDark ? "#e5e7eb" : "#4b5563",
                                }}
                            >
                                <FiX className="w-5 h-5" />
                            </motion.button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="relative z-10 p-6 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {integrations.map((integration, index) => (
                                <motion.div
                                    key={integration.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                    whileHover={{ scale: integration.isActive ? 1.02 : 1, y: integration.isActive ? -2 : 0 }}
                                    whileTap={{ scale: integration.isActive ? 0.98 : 1 }}
                                    onClick={() => handleIntegrationClick(integration)}
                                    className={`p-4 rounded-xl border transition-all duration-200 ${
                                        integration.isActive ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                                    }`}
                                    style={{
                                        background: isDark
                                            ? `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))`
                                            : `linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.02))`,
                                        border: isDark
                                            ? `1px solid ${integration.isActive ? integration.color + "40" : "rgba(255,255,255,0.1)"}`
                                            : `1px solid ${integration.isActive ? integration.color + "30" : "rgba(0,0,0,0.05)"}`,
                                        boxShadow: integration.isActive ? `0 4px 15px ${integration.color}20` : "0 2px 8px rgba(0,0,0,0.1)",
                                    }}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div
                                            className="p-2.5 rounded-lg flex-shrink-0"
                                            style={{
                                                background: integration.isActive
                                                    ? `linear-gradient(135deg, ${integration.color}, ${integration.color}CC)`
                                                    : isDark
                                                        ? "rgba(255,255,255,0.1)"
                                                        : "rgba(0,0,0,0.1)",
                                                boxShadow: integration.isActive ? `0 4px 12px ${integration.color}40` : "none",
                                            }}
                                        >
                                            {integration.logoPath ? (
                                                <Image
                                                    src={integration.logoPath || "/placeholder.svg"}
                                                    alt={`${integration.name} logo`}
                                                    width={20}
                                                    height={20}
                                                    className="w-5 h-5 object-contain"
                                                />
                                            ) : (
                                                <integration.icon
                                                    className="w-5 h-5"
                                                    style={{
                                                        color: integration.isActive ? "white" : isDark ? "#9ca3af" : "#6b7280",
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div
                                            className="px-2 py-1 rounded-full text-xs font-medium"
                                            style={{
                                                background:
                                                    integration.status === "active" ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                                                color: integration.status === "active" ? "#10b981" : "#f59e0b",
                                                border:
                                                    integration.status === "active"
                                                        ? "1px solid rgba(16, 185, 129, 0.2)"
                                                        : "1px solid rgba(245, 158, 11, 0.2)",
                                            }}
                                        >
                                            {integration.status === "active" ? "Ativo" : "Em breve"}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3
                                            className="font-semibold text-base"
                                            style={{
                                                color: isDark ? "#ffffff" : "#111827",
                                                fontFamily: "system-ui, -apple-system, sans-serif",
                                            }}
                                        >
                                            {integration.name}
                                        </h3>
                                        <p
                                            className="text-sm leading-tight"
                                            style={{
                                                color: isDark ? "#d1d5db" : "#6b7280",
                                                fontFamily: "system-ui, -apple-system, sans-serif",
                                            }}
                                        >
                                            {integration.description}
                                        </p>
                                        <div
                                            className="inline-block px-2 py-1 rounded text-xs font-medium"
                                            style={{
                                                background: integration.isActive
                                                    ? `${integration.color}20`
                                                    : isDark
                                                        ? "rgba(255,255,255,0.1)"
                                                        : "rgba(0,0,0,0.05)",
                                                color: integration.isActive ? integration.color : isDark ? "#9ca3af" : "#6b7280",
                                            }}
                                        >
                                            {integration.category}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div
                        className="relative z-10 flex justify-between items-center p-6 border-t"
                        style={{
                            borderColor: isDark ? `${currentGradient.glow}40` : `${currentGradient.primary}30`,
                            background: isDark
                                ? `linear-gradient(135deg, rgba(0,0,0,0.8), rgba(15,15,15,0.6))`
                                : `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(248,250,252,0.6))`,
                        }}
                    >
                        <div className="flex items-center gap-2 text-sm" style={{ color: isDark ? "#d1d5db" : "#6b7280" }}>
                            <FiZap className="w-4 h-4" />
                            <span>{integrations.length} integrações disponíveis</span>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-medium rounded-lg transition-colors"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                                color: isDark ? "#e5e7eb" : "#4b5563",
                                fontFamily: "system-ui, -apple-system, sans-serif",
                            }}
                        >
                            Fechar
                        </motion.button>
                    </div>
                </motion.div>
            </div>

            {/* Integration Modals */}
            <AnimatePresence>
                {selectedIntegration === "blip" && (
                    <BlipIntegration
                        isOpen={true}
                        onClose={closeIntegrationModal}
                        theme={theme}
                        currentGradient={currentGradient}
                    />
                )}
                {selectedIntegration === "figma" && (
                    <FigmaIntegration
                        isOpen={true}
                        onClose={closeIntegrationModal}
                        theme={theme}
                        currentGradient={currentGradient}
                    />
                )}
            </AnimatePresence>
        </>
    )
}

export default IntegrationsMenu