"use client"

import { useState, useEffect } from "react"
import type { Node } from "reactflow"
import { X, Copy, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import CodeEditor from "./code-editor"
import { useTheme } from "../ThemeContext"
import { toast } from "@/components/ui/use-toast"

interface WorkflowNode {
  id: string
  type: string
  data: any
  position: { x: number; y: number }
}

interface NodeConfigPanelProps {
  node: Node
  updateNodeData: (nodeId: string, data: any) => void
  onClose: () => void
  onRemove: () => void
  onUpdate: (node: Node) => void
}

// Mapeamento de tipos para nomes em português
const getNodeTypeName = (type: string): string => {
  const typeNames: Record<string, string> = {
    sendMessage: "Enviar Mensagem",
    options: "Opções",
    process: "Processar",
    conditional: "Condicional",
    code: "Código",
    finalizar: "Finalizar",
    input: "Entrada",
    output: "Saída",
  }
  return typeNames[type] || type
}

export default function NodeConfigPanel({ node, updateNodeData, onClose, onRemove, onUpdate }: NodeConfigPanelProps) {
  const { theme } = useTheme()
  const [localData, setLocalData] = useState({ ...node.data })
  const [label, setLabel] = useState(node.data.label || "")
  const [description, setDescription] = useState(node.data.description || "")

  // Sincronizar mudanças em tempo real
  useEffect(() => {
    setLocalData({ ...node.data })
  }, [node.data])

  const handleChange = (key: string, value: any) => {
    const newData = {
      ...localData,
      [key]: value,
    }
    setLocalData(newData)
    updateNodeData(node.id, newData)
  }

  const handleSave = () => {
    const updatedNode = {
      ...node,
      data: {
        ...node.data,
        label,
        description,
      },
    }
    onUpdate(updatedNode)
  }

  const copyNodeId = () => {
    const idToCopy = localData.customId || node.id
    navigator.clipboard.writeText(idToCopy)
    toast({
      title: "ID copiado!",
      description: `ID ${idToCopy} copiado para a área de transferência`,
    })
  }

  const handleRemove = () => {
    if (confirm("Tem certeza que deseja remover este nó?")) {
      onRemove()
    }
  }

  const renderInputFields = () => {
    switch (node.type) {
      case "input":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="dataSource">Fonte de Dados</Label>
              <Select
                value={localData.dataSource || "manual"}
                onValueChange={(value) => handleChange("dataSource", value)}
              >
                <SelectTrigger id="dataSource">
                  <SelectValue placeholder="Selecione a fonte de dados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Entrada Manual</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="database">Banco de Dados</SelectItem>
                  <SelectItem value="file">Upload de Arquivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sampleData">Dados de Exemplo (JSON)</Label>
              <Textarea
                id="sampleData"
                value={localData.sampleData || ""}
                onChange={(e) => handleChange("sampleData", e.target.value)}
                className="h-32"
                placeholder='{"chave": "valor"}'
              />
            </div>
          </>
        )

      case "output":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="outputType">Tipo de Saída</Label>
              <Select
                value={localData.outputType || "console"}
                onValueChange={(value) => handleChange("outputType", value)}
              >
                <SelectTrigger id="outputType">
                  <SelectValue placeholder="Selecione o tipo de saída" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="console">Console</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="database">Banco de Dados</SelectItem>
                  <SelectItem value="file">Arquivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outputFormat">Formato de Saída</Label>
              <Select
                value={localData.outputFormat || "json"}
                onValueChange={(value) => handleChange("outputFormat", value)}
              >
                <SelectTrigger id="outputFormat">
                  <SelectValue placeholder="Selecione o formato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                  <SelectItem value="text">Texto Simples</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )

      case "process":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="processType">Tipo de Processo</Label>
              <Select
                value={localData.processType || "transform"}
                onValueChange={(value) => handleChange("processType", value)}
              >
                <SelectTrigger id="processType">
                  <SelectValue placeholder="Selecione o tipo de processo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transform">Transformar</SelectItem>
                  <SelectItem value="filter">Filtrar</SelectItem>
                  <SelectItem value="aggregate">Agregar</SelectItem>
                  <SelectItem value="sort">Ordenar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="processConfig">Configuração do Processo (JSON)</Label>
              <Textarea
                id="processConfig"
                value={localData.processConfig || ""}
                onChange={(e) => handleChange("processConfig", e.target.value)}
                className="h-32"
                placeholder='{"operacao": "valor"}'
              />
            </div>
          </>
        )

      case "conditional":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="condition">Condição</Label>
              <Input
                id="condition"
                value={localData.condition || ""}
                onChange={(e) => handleChange("condition", e.target.value)}
                placeholder="dados.valor > 10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trueLabel">Rótulo do Caminho Verdadeiro</Label>
              <Input
                id="trueLabel"
                value={localData.trueLabel || "Sim"}
                onChange={(e) => handleChange("trueLabel", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="falseLabel">Rótulo do Caminho Falso</Label>
              <Input
                id="falseLabel"
                value={localData.falseLabel || "Não"}
                onChange={(e) => handleChange("falseLabel", e.target.value)}
              />
            </div>
          </>
        )

      case "code":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="codeLanguage">Linguagem</Label>
              <Select
                value={localData.codeLanguage || "javascript"}
                onValueChange={(value) => handleChange("codeLanguage", value)}
              >
                <SelectTrigger id="codeLanguage">
                  <SelectValue placeholder="Selecione a linguagem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="typescript">TypeScript</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <CodeEditor
                value={
                  localData.code ||
                  "// Escreva seu código aqui\nfunction processar(dados) {\n  // Transformar dados\n  return dados;\n}"
                }
                onChange={(value) => handleChange("code", value)}
                language={localData.codeLanguage || "javascript"}
              />
            </div>
          </>
        )

      case "sendMessage":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="message">Mensagem</Label>
              <Textarea
                id="message"
                value={localData.message || ""}
                onChange={(e) => handleChange("message", e.target.value)}
                className="h-32"
                placeholder="Digite a mensagem que será enviada..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="messageType">Tipo de Mensagem</Label>
              <Select
                value={localData.messageType || "text"}
                onValueChange={(value) => handleChange("messageType", value)}
              >
                <SelectTrigger id="messageType">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )

      case "options":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="message">Mensagem</Label>
              <Textarea
                id="message"
                value={localData.message || ""}
                onChange={(e) => handleChange("message", e.target.value)}
                className="h-32"
                placeholder="Digite a mensagem que será exibida com as opções..."
              />
            </div>

            <div className="space-y-2">
              <Label>Configurar Opções</Label>
              <div className="text-xs text-gray-500 mb-2">Configure as opções que o usuário poderá escolher</div>

              {/* Gerenciar opções */}
              {(localData.options || [{ text: "Opção 1", digit: "1" }]).map((option: any, index: number) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded-lg">
                  <span className="text-sm font-medium w-6">{index + 1}</span>
                  <div className="flex-1">
                    <Input
                      value={option.text || ""}
                      onChange={(e) => {
                        const newOptions = [...(localData.options || [])]
                        newOptions[index] = { ...newOptions[index], text: e.target.value }
                        handleChange("options", newOptions)
                      }}
                      placeholder="Texto da opção"
                      className="mb-1"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      value={option.digit || ""}
                      onChange={(e) => {
                        const newOptions = [...(localData.options || [])]
                        newOptions[index] = { ...newOptions[index], digit: e.target.value }
                        handleChange("options", newOptions)
                      }}
                      placeholder="Dígito"
                      className="text-center"
                    />
                  </div>
                  {index > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newOptions = (localData.options || []).filter((_: any, i: number) => i !== index)
                        handleChange("options", newOptions)
                      }}
                    >
                      ✕
                    </Button>
                  )}
                </div>
              ))}

              <Button
                variant="outline"
                onClick={() => {
                  const newOptions = [
                    ...(localData.options || []),
                    {
                      text: `Opção ${(localData.options || []).length + 1}`,
                      digit: `${(localData.options || []).length + 1}`,
                    },
                  ]
                  handleChange("options", newOptions)
                }}
                className="w-full"
              >
                + Adicionar Opção
              </Button>
            </div>
          </>
        )

      case "finalizar":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="finalizationType">Tipo de Finalização</Label>
              <Select
                value={localData.finalizationType || "success"}
                onValueChange={(value) => handleChange("finalizationType", value)}
              >
                <SelectTrigger id="finalizationType">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                  <SelectItem value="cancel">Cancelamento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finalMessage">Mensagem Final</Label>
              <Textarea
                id="finalMessage"
                value={localData.finalMessage || ""}
                onChange={(e) => handleChange("finalMessage", e.target.value)}
                className="h-24"
                placeholder="Mensagem exibida ao finalizar o fluxo..."
              />
            </div>
          </>
        )

      default:
        return null
    }
  }

  const isDark = theme === "dark"

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center">
          <Settings className="h-5 w-5 mr-2 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Node Configuration</h3>
        </div>
        <Button onClick={onClose} size="sm" variant="ghost" className="text-gray-400 hover:text-white">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div>
          <Label htmlFor="node-id" className="text-gray-300">
            Node ID
          </Label>
          <Input id="node-id" value={node.id} disabled className="bg-gray-700 border-gray-600 text-gray-400" />
        </div>

        <div>
          <Label htmlFor="node-type" className="text-gray-300">
            Node Type
          </Label>
          <Input
            id="node-type"
            value={node.type || "unknown"}
            disabled
            className="bg-gray-700 border-gray-600 text-gray-400"
          />
        </div>

        <div>
          <Label htmlFor="node-label" className="text-gray-300">
            Label
          </Label>
          <Input
            id="node-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-gray-700 border-gray-600 text-white"
            placeholder="Enter node label"
          />
        </div>

        <div>
          <Label htmlFor="node-description" className="text-gray-300">
            Description
          </Label>
          <Textarea
            id="node-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-gray-700 border-gray-600 text-white"
            placeholder="Enter node description"
            rows={4}
          />
        </div>

        <div>
          <Label className="text-gray-300">Position</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={Math.round(node.position.x)}
              disabled
              className="bg-gray-700 border-gray-600 text-gray-400"
              placeholder="X"
            />
            <Input
              value={Math.round(node.position.y)}
              disabled
              className="bg-gray-700 border-gray-600 text-gray-400"
              placeholder="Y"
            />
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto">
          {/* ID do Nó - READONLY */}
          <div className="space-y-2">
            <Label htmlFor="nodeId">ID do Componente</Label>
            <div className="flex gap-2">
              <Input
                id="nodeId"
                value={localData.customId || node.id}
                readOnly
                className={`${isDark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"} cursor-not-allowed`}
                placeholder="ID único do componente"
              />
              <Button variant="outline" size="icon" onClick={copyNodeId} title="Copiar ID">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-gray-500">O ID é gerado automaticamente e não pode ser alterado</div>
          </div>

          <div className={`border-t my-4 ${isDark ? "border-gray-800" : "border-gray-200"}`}></div>

          {renderInputFields()}
        </div>
      </div>

      <div className="p-4 border-t border-gray-700">
        <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700">
          Save Changes
        </Button>
      </div>
    </div>
  )
}
