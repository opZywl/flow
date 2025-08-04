// API Real do Figma com OAuth
export interface FigmaFile {
    key: string
    name: string
    last_modified: string
    projectName?: string
    teamName?: string
    thumbnail_url?: string
}

export interface FigmaUser {
    id: string
    email: string
    handle: string
    img_url: string
}

export interface FigmaTeam {
    id: string
    name: string
}

export interface FigmaProject {
    id: string
    name: string
}

export interface FigmaCommandResponse<T> {
    success: boolean
    data?: T
    message?: string
    error?: string
}

export class FigmaAPI {
    private accessToken: string
    private baseUrl = "https://api.figma.com/v1"

    constructor(accessToken: string) {
        this.accessToken = accessToken
    }

    private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<FigmaCommandResponse<T>> {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    "X-Figma-Token": this.accessToken,
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                return {
                    success: false,
                    error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
                }
            }

            const data = await response.json()
            return {
                success: true,
                data,
            }
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === "AbortError") {
                    return {
                        success: false,
                        error: "Timeout: A requisição demorou muito para responder",
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

    // Validar token e obter informações do usuário
    async validateToken(): Promise<FigmaCommandResponse<FigmaUser>> {
        const result = await this.makeRequest<FigmaUser>("/me")
        return result
    }

    // Listar arquivos do usuário (método melhorado)
    async getFiles(): Promise<FigmaCommandResponse<FigmaFile[]>> {
        try {
            // Primeiro, obter informações do usuário
            const userResult = await this.validateToken()
            if (!userResult.success || !userResult.data) {
                return {
                    success: false,
                    error: "Não foi possível validar o token",
                }
            }

            // Para contas gratuitas, não temos acesso a teams via API
            // Vamos retornar uma lista vazia e orientar o usuário
            return {
                success: true,
                data: [],
                message:
                    "Para listar arquivos automaticamente, você precisa de uma conta Figma Enterprise ou usar URLs diretas de arquivos.",
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erro ao buscar arquivos",
            }
        }
    }

    // Obter arquivo por URL ou file key
    async getFileByKey(fileKey: string): Promise<FigmaCommandResponse<any>> {
        const result = await this.makeRequest(`/files/${fileKey}`)
        return result
    }

    // Extrair file key de uma URL do Figma
    static extractFileKeyFromUrl(url: string): string | null {
        const match = url.match(/figma\.com\/file\/([a-zA-Z0-9]+)/)
        return match ? match[1] : null
    }

    // Converter arquivo Figma para formato de fluxo
    convertFigmaToFlow(figmaFile: any): any {
        const nodes: any[] = []
        const edges: any[] = []
        let nodeIndex = 0

        const processNode = (node: any, parentId?: string, level = 0) => {
            if (level > 3) return // Limitar profundidade

            const nodeId = `figma-${node.id}`
            const position = {
                x: Math.max(0, (node.absoluteBoundingBox?.x || 0) / 4),
                y: Math.max(0, (node.absoluteBoundingBox?.y || 0) / 4),
            }

            // Determinar tipo do nó baseado no tipo Figma
            let nodeType = "process"
            let nodeData: any = {
                label: node.name || `Node ${nodeIndex + 1}`,
                customId: `#F${nodeIndex + 1}`,
            }

            // Lógica melhorada de conversão baseada no nome e tipo
            const nodeName = (node.name || "").toLowerCase()

            if (nodeName.includes("start") || nodeName.includes("início")) {
                nodeType = "start"
                nodeData = {
                    label: "INÍCIO",
                    description: `Importado do Figma: ${node.name}`,
                }
            } else if (node.type === "TEXT" || nodeName.includes("message") || nodeName.includes("mensagem")) {
                nodeType = "sendMessage"
                nodeData = {
                    label: "Mensagem",
                    message: node.characters || node.name || "Mensagem importada",
                    customId: `#F${nodeIndex + 1}`,
                }
            } else if (nodeName.includes("option") || nodeName.includes("choice") || nodeName.includes("opção")) {
                nodeType = "options"
                nodeData = {
                    label: "Opções",
                    message: `Escolha uma opção:`,
                    options: [
                        { id: "opt1", text: "Opção 1" },
                        { id: "opt2", text: "Opção 2" },
                    ],
                    customId: `#F${nodeIndex + 1}`,
                }
            } else if (nodeName.includes("condition") || nodeName.includes("if") || nodeName.includes("condição")) {
                nodeType = "conditional"
                nodeData = {
                    label: "Condicional",
                    condition: "user.input == 'sim'",
                    customId: `#F${nodeIndex + 1}`,
                }
            } else if (nodeName.includes("end") || nodeName.includes("fim") || nodeName.includes("finalizar")) {
                nodeType = "finalizar"
                nodeData = {
                    label: "FINALIZAR",
                    description: `Fim do fluxo: ${node.name}`,
                }
            }

            nodes.push({
                id: nodeId,
                type: nodeType,
                position,
                data: nodeData,
            })

            // Criar conexão com o nó pai
            if (parentId) {
                edges.push({
                    id: `${parentId}-to-${nodeId}`,
                    source: parentId,
                    target: nodeId,
                    type: "custom",
                })
            }

            nodeIndex++

            // Processar filhos recursivamente
            if (node.children && node.children.length > 0) {
                node.children.forEach((child: any) => {
                    processNode(child, nodeId, level + 1)
                })
            }
        }

        // Processar documento Figma
        if (figmaFile.document && figmaFile.document.children) {
            figmaFile.document.children.forEach((page: any) => {
                if (page.children) {
                    page.children.forEach((child: any) => {
                        processNode(child)
                    })
                }
            })
        }

        return {
            id: `figma-import-${Date.now()}`,
            name: `Importado do Figma: ${figmaFile.name}`,
            nodes,
            edges,
            metadata: {
                source: "figma",
                originalFileKey: figmaFile.key || "unknown",
                importedAt: new Date().toISOString(),
            },
        }
    }

    // Converter fluxo para formato Figma
    convertFlowToFigma(flowData: any): any {
        const figmaNodes: any[] = []

        flowData.nodes?.forEach((node: any, index: number) => {
            const figmaNode = {
                id: `flow-${node.id}`,
                name: node.data.label || `Node ${index + 1}`,
                type: "FRAME",
                absoluteBoundingBox: {
                    x: node.position.x * 4,
                    y: node.position.y * 4,
                    width: 200,
                    height: 100,
                },
                fills: [
                    {
                        type: "SOLID",
                        color: this.getNodeColor(node.type),
                    },
                ],
                children: [
                    {
                        id: `text-${node.id}`,
                        name: "Node Text",
                        type: "TEXT",
                        characters: node.data.message || node.data.label || "Node",
                        style: {
                            fontFamily: "Inter",
                            fontSize: 14,
                            fontWeight: 400,
                        },
                    },
                ],
            }

            figmaNodes.push(figmaNode)
        })

        return {
            name: flowData.name || "Fluxo Exportado",
            document: {
                id: "0:0",
                name: "Document",
                type: "DOCUMENT",
                children: [
                    {
                        id: "0:1",
                        name: "Page 1",
                        type: "CANVAS",
                        children: figmaNodes,
                    },
                ],
            },
        }
    }

    private getNodeColor(nodeType: string): { r: number; g: number; b: number } {
        const colors = {
            start: { r: 0.2, g: 0.8, b: 0.2 },
            sendMessage: { r: 0.2, g: 0.4, b: 0.8 },
            options: { r: 0.8, g: 0.6, b: 0.2 },
            conditional: { r: 0.8, g: 0.2, b: 0.8 },
            finalizar: { r: 0.8, g: 0.2, b: 0.2 },
            default: { r: 0.5, g: 0.5, b: 0.5 },
        }
        return colors[nodeType as keyof typeof colors] || colors.default
    }
}

// OAuth do Figma
export class FigmaOAuth {
    private clientId = "YOUR_FIGMA_CLIENT_ID" // Substitua pelo seu Client ID
    private redirectUri = typeof window !== "undefined" ? `${window.location.origin}/figma-callback` : ""
    private scopes = ["file_read"]

    // Iniciar fluxo OAuth
    startOAuthFlow(): void {
        const state = this.generateState()
        localStorage.setItem("figma_oauth_state", state)

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: this.scopes.join(" "),
            state,
            response_type: "code",
        })

        const authUrl = `https://www.figma.com/oauth?${params.toString()}`
        window.open(authUrl, "figma-oauth", "width=500,height=600,scrollbars=yes,resizable=yes")
    }

    // Gerar state para segurança OAuth
    private generateState(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    }

    // Validar state OAuth
    validateState(state: string): boolean {
        const storedState = localStorage.getItem("figma_oauth_state")
        localStorage.removeItem("figma_oauth_state")
        return storedState === state
    }

    // Trocar código por token (isso deveria ser feito no backend por segurança)
    async exchangeCodeForToken(code: string): Promise<FigmaCommandResponse<{ access_token: string }>> {
        try {
            // ATENÇÃO: Em produção, isso deve ser feito no backend!
            const response = await fetch("https://www.figma.com/api/oauth/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: "YOUR_CLIENT_SECRET", // NUNCA exponha isso no frontend!
                    redirect_uri: this.redirectUri,
                    code,
                    grant_type: "authorization_code",
                }),
            })

            if (!response.ok) {
                return {
                    success: false,
                    error: "Erro ao trocar código por token",
                }
            }

            const data = await response.json()
            return {
                success: true,
                data,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erro desconhecido",
            }
        }
    }
}