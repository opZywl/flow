export function downloadText(text: string, filename: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJson(text: string, filename: string) {
  downloadText(text, filename, "application/json;charset=utf-8")
}
