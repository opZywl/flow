export interface BlipCommandResponse<T> {
    success: boolean
    data?: T
    message?: string
    error?: string
    status?: "success" | "failure"
    resource?: T
    reason?: string
}

export interface FlowInfo {
    id: string
    name: string
    description?: string
    lastModified?: string
    isActive?: boolean
}

export interface BlipAccount {
    fullName: string
    email: string
    photoUri?: string
    culture: string
}

export class BlipAPI {
    private apiKey: string
    private baseUrl = "https://http.msging.net"

    constructor(apiKey: string) {
        this.apiKey = apiKey
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    }

    private async makeRequest<T>(
        method: "GET" | "POST" | "PUT" | "DELETE",
        uri: string,
        resource?: any,
        to = "postmaster@msging.net",
    ): Promise<BlipCommandResponse<T>> {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 30000)

            const body = {
                id: this.generateId(),
                to,
                method: method.toLowerCase(),
                uri,
                ...(resource && { resource }),
            }

            const response = await fetch(`${this.baseUrl}/commands`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Key ${this.apiKey}`,
                },
                body: JSON.stringify(body),
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                }
            }

            const data = await response.json()

            if (data.status === "failure") {
                return {
                    success: false,
                    error: data.reason || "Comando falhou",
                    ...data,
                }
            }

            return {
                success: true,
                data: data.resource || data,
                ...data,
            }
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === "AbortError") {
                    return {
                        success: false,
                        error: "Tempo esgotado: o BliP não respondeu em 30 segundos.",
                    }
                }
                return {
                    success: false,
                    error: error.message,
                }
            }
            return {
                success: false,
                error: "Erro desconhecido",
            }
        }
    }

    async validateApiKey(): Promise<BlipCommandResponse<BlipAccount>> {
        const result = await this.makeRequest<BlipAccount>("GET", "/account")
        return result
    }

    async getFlows(): Promise<BlipCommandResponse<FlowInfo[]>> {
        const result = await this.makeRequest<any>("GET", "/flows")

        if (result.success && result.data) {
            const flows: FlowInfo[] = Object.entries(result.data).map(([id, flow]: [string, any]) => ({
                id,
                name: flow.name || id,
                description: flow.description,
                lastModified: flow.lastModified,
                isActive: flow.isActive || false,
            }))

            return {
                success: true,
                data: flows,
            }
        }

        return result
    }

    async getFlow(flowId: string): Promise<BlipCommandResponse<any>> {
        const result = await this.makeRequest<any>("GET", `/flows/${flowId}`)
        return result
    }

    async createOrUpdateFlow(flowId: string, flowData: any): Promise<BlipCommandResponse<any>> {
        const blipFlow = this.convertToBlipFormat(flowData)
        const result = await this.makeRequest<any>("PUT", `/flows/${flowId}`, blipFlow)
        return result
    }

    async setupWebhook(webhookUrl: string): Promise<BlipCommandResponse<any>> {
        const result = await this.makeRequest<any>("PUT", "/webhook", {
            url: webhookUrl,
            method: "POST",
        })
        return result
    }

    convertToBlipFormat(flowData: any): any {
        if (flowData.nodes?.some((node: any) => node.type === "custom" && node.data?.type)) {
            throw new Error("O envio direto ao BliP ainda não possui mapeamento para os componentes de Atendimento. Use Exportar JSON para preservar o fluxo completo.")
        }
        const states: any = {}
        const transitions: any = {}

        flowData.nodes?.forEach((node: any) => {
            const stateId = node.id

            switch (node.type) {
                case "start":
                    states[stateId] = {
                        name: node.data.label || "Início",
                        root: true,
                        input: {
                            bypass: true,
                        },
                        outputs: [],
                    }
                    break

                case "sendMessage":
                    states[stateId] = {
                        name: node.data.label || "Mensagem",
                        input: {
                            bypass: true,
                        },
                        outputs: [
                            {
                                stateId: "default",
                                conditions: [],
                                output: {
                                    type: "text/plain",
                                    value: node.data.message || "Mensagem",
                                },
                            },
                        ],
                    }
                    break

                case "options":
                    states[stateId] = {
                        name: node.data.label || "Opções",
                        input: {
                            bypass: false,
                        },
                        outputs: [
                            {
                                stateId: "default",
                                conditions: [],
                                output: {
                                    type: "application/vnd.lime.select+json",
                                    value: {
                                        text: node.data.message || "Escolha uma opção:",
                                        options:
                                            node.data.options?.map((opt: any, index: number) => ({
                                                order: index + 1,
                                                text: opt.text,
                                                value: opt.id,
                                            })) || [],
                                    },
                                },
                            },
                        ],
                    }
                    break

                case "conditional":
                    states[stateId] = {
                        name: node.data.label || "Condicional",
                        input: {
                            bypass: true,
                        },
                        outputs: [],
                    }
                    break

                case "finalizar":
                    states[stateId] = {
                        name: node.data.label || "Finalizar",
                        input: {
                            bypass: true,
                        },
                        outputs: [
                            {
                                stateId: "default",
                                conditions: [],
                                output: {
                                    type: "text/plain",
                                    value: "Conversa finalizada. Obrigado!",
                                },
                            },
                        ],
                    }
                    break

                default:
                    states[stateId] = {
                        name: node.data.label || "Estado",
                        input: {
                            bypass: true,
                        },
                        outputs: [],
                    }
            }
        })

        flowData.edges?.forEach((edge: any) => {
            const sourceState = states[edge.source]
            if (sourceState) {
                if (!transitions[edge.source]) {
                    transitions[edge.source] = []
                }

                transitions[edge.source].push({
                    conditions: [],
                    target: edge.target,
                })
            }
        })

        return {
            name: flowData.name || "Fluxo Importado",
            states,
            transitions,
            configuration: {
                startState: flowData.nodes?.find((n: any) => n.type === "start")?.id || Object.keys(states)[0],
            },
        }
    }

    convertFromBlipFormat(blipFlow: any): any {
        const nodes: any[] = []
        const edges: any[] = []
        let nodeIndex = 0

        Object.entries(blipFlow.states || {}).forEach(([stateId, state]: [string, any]) => {
            const position = {
                x: Math.random() * 800 + 100,
                y: Math.random() * 600 + 100,
            }

            let nodeType = "process"
            let nodeData: any = {
                label: state.name || `Estado ${nodeIndex + 1}`,
                customId: `#B${nodeIndex + 1}`,
            }

            if (state.root) {
                nodeType = "start"
                nodeData = {
                    label: "INÍCIO",
                    description: state.name || "Início do fluxo",
                }
            } else if (state.outputs?.length > 0) {
                const output = state.outputs[0].output

                if (output?.type === "text/plain") {
                    nodeType = "sendMessage"
                    nodeData = {
                        label: "Mensagem",
                        message: output.value || state.name,
                        customId: `#B${nodeIndex + 1}`,
                    }
                } else if (output?.type === "application/vnd.lime.select+json") {
                    nodeType = "options"
                    nodeData = {
                        label: "Opções",
                        message: output.value?.text || "Escolha uma opção:",
                        options:
                            output.value?.options?.map((opt: any) => ({
                                id: opt.value,
                                text: opt.text,
                            })) || [],
                        customId: `#B${nodeIndex + 1}`,
                    }
                }
            }

            nodes.push({
                id: stateId,
                type: nodeType,
                position,
                data: nodeData,
            })

            nodeIndex++
        })

        Object.entries(blipFlow.transitions || {}).forEach(([sourceId, transitions]: [string, any]) => {
            if (Array.isArray(transitions)) {
                transitions.forEach((transition: any, index: number) => {
                    edges.push({
                        id: `${sourceId}-to-${transition.target}-${index}`,
                        source: sourceId,
                        target: transition.target,
                        type: "custom",
                    })
                })
            }
        })

        return {
            id: `blip-import-${Date.now()}`,
            name: blipFlow.name || "Importado do BliP",
            nodes,
            edges,
            metadata: {
                source: "blip",
                originalFlowId: blipFlow.id || "unknown",
                importedAt: new Date().toISOString(),
            },
        }
    }
}
