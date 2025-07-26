"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ChannelModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ChannelModal({ isOpen, onClose }: ChannelModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Channel Settings</DialogTitle>
        </DialogHeader>
        <div className="text-gray-300">Channel configuration options will be available here.</div>
      </DialogContent>
    </Dialog>
  )
}
