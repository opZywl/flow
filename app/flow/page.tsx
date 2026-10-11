import type { Metadata } from "next"
import Flow from "@/src/flow/Flow"

export const metadata: Metadata = {
  title: "Editor de fluxos | WorkFlow",
}

export default function FlowPage() {
  return <Flow />
}
