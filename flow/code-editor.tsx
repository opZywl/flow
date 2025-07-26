"use client"

import { useState, useEffect } from "react"
import { Editor } from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface CodeEditorProps {
  initialCode?: string
  initialLanguage?: string
  onSave?: (code: string, language: string) => void
}

export function CodeEditor({ initialCode = "", initialLanguage = "javascript", onSave }: CodeEditorProps) {
  const [code, setCode] = useState(initialCode)
  const [language, setLanguage] = useState(initialLanguage)

  useEffect(() => {
    setCode(initialCode)
    setLanguage(initialLanguage)
  }, [initialCode, initialLanguage])

  const handleEditorChange = (value: string | undefined) => {
    setCode(value || "")
  }

  const handleLanguageChange = (value: string) => {
    setLanguage(value)
  }

  const handleSave = () => {
    onSave?.(code, language)
  }

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Code Editor</CardTitle>
        <div className="flex items-center space-x-2">
          <Select onValueChange={handleLanguageChange} value={language}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
              <SelectItem value="css">CSS</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSave}>Save Code</Button>
        </div>
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </CardContent>
    </Card>
  )
}
