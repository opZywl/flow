"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

interface Particle {
  id: number
  x: number
  y: number
  driftX: number
  driftY: number
  size: number
  color: string
  opacity: number
}

const COLORS = ["#a78bfa", "#22d3ee", "#7c3aed", "#0891b2"]
const PARTICLE_CHANCE = 0.3
const MAX_PARTICLES = 16
const KEPT_PARTICLES = 10
const IDLE_DELAY_MS = 100
const CLEANUP_INTERVAL_MS = 2000

function createParticle(x: number, y: number): Particle {
  return {
    id: Date.now() + Math.random(),
    x: x + (Math.random() - 0.5) * 20,
    y: y + (Math.random() - 0.5) * 20,
    driftX: (Math.random() - 0.5) * 100,
    driftY: (Math.random() - 0.5) * 100,
    size: Math.random() * 4 + 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    opacity: Math.random() * 0.8 + 0.2,
  }
}

export function MouseTrailEffect() {
  const reduceMotion = useReducedMotion()
  const [particles, setParticles] = useState<Particle[]>([])
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [isMoving, setIsMoving] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (reduceMotion) return
    const handleMouseMove = (event: MouseEvent) => {
      setCursor({ x: event.clientX, y: event.clientY })
      setIsMoving(true)
      if (Math.random() < PARTICLE_CHANCE) {
        const particle = createParticle(event.clientX, event.clientY)
        setParticles((previous) => [...previous.slice(-(MAX_PARTICLES - 1)), particle])
      }
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setIsMoving(false), IDLE_DELAY_MS)
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      clearTimeout(idleTimer.current)
    }
  }, [reduceMotion])

  useEffect(() => {
    if (reduceMotion) return
    const interval = setInterval(() => setParticles((previous) => previous.slice(-KEPT_PARTICLES)), CLEANUP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [reduceMotion])

  if (reduceMotion) return null

  return (
    <>
      <motion.div
        className="pointer-events-none fixed z-50 mix-blend-difference"
        aria-hidden="true"
        animate={{ x: cursor.x - 10, y: cursor.y - 10, scale: isMoving ? 1.5 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 28, mass: 0.5 }}
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.8) 0%, rgba(34, 211, 238, 0.4) 100%)",
          boxShadow: "0 0 20px rgba(167, 139, 250, 0.6)",
        }}
      />

      <motion.div
        className="pointer-events-none fixed z-40"
        aria-hidden="true"
        animate={{ x: cursor.x - 50, y: cursor.y - 50, opacity: isMoving ? 0.6 : 0.2 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.1) 0%, transparent 70%)",
          filter: "blur(10px)",
        }}
      />

      <div className="pointer-events-none fixed inset-0 z-30" aria-hidden="true">
        <AnimatePresence>
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              initial={{ x: particle.x, y: particle.y, scale: 0, opacity: particle.opacity }}
              animate={{ x: particle.x + particle.driftX, y: particle.y + particle.driftY, scale: 1, opacity: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
              style={{
                position: "absolute",
                width: particle.size,
                height: particle.size,
                borderRadius: "50%",
                backgroundColor: particle.color,
                boxShadow: `0 0 10px ${particle.color}`,
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        a:hover,
        button:hover {
          text-shadow: 0 0 10px rgba(167, 139, 250, 0.6);
        }

        * {
          cursor: none !important;
        }

        a,
        button,
        input,
        textarea,
        select {
          cursor: pointer !important;
        }
      `}</style>
    </>
  )
}
