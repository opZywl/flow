"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface Particle {
  id: number
  x: number
  y: number
  size: number
  color: string
  opacity: number
}

interface CursorPosition {
  x: number
  y: number
}

export function MouseTrailEffect() {
  const [particles, setParticles] = useState<Particle[]>([])
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ x: 0, y: 0 })
  const [isMoving, setIsMoving] = useState(false)

  const colors = ["#a78bfa", "#22d3ee", "#7c3aed", "#0891b2"]

  const createParticle = useCallback(
    (x: number, y: number) => {
      const particle: Particle = {
        id: Date.now() + Math.random(),
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.8 + 0.2,
      }
      return particle
    },
    [colors],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      setCursorPosition({ x: e.clientX, y: e.clientY })
      setIsMoving(true)

      // Create particles occasionally
      if (Math.random() < 0.3) {
        const newParticle = createParticle(e.clientX, e.clientY)
        setParticles((prev) => [...prev.slice(-15), newParticle])
      }

      // Clear moving state after a delay
      setTimeout(() => setIsMoving(false), 100)
    },
    [createParticle],
  )

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [handleMouseMove])

  // Clean up old particles
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prev) => prev.slice(-10))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Custom Cursor */}
      <motion.div
        className="fixed pointer-events-none z-50 mix-blend-difference"
        animate={{
          x: cursorPosition.x - 10,
          y: cursorPosition.y - 10,
          scale: isMoving ? 1.5 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 28,
          mass: 0.5,
        }}
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.8) 0%, rgba(34, 211, 238, 0.4) 100%)",
          boxShadow: "0 0 20px rgba(167, 139, 250, 0.6)",
        }}
      />

      {/* Glow Effect */}
      <motion.div
        className="fixed pointer-events-none z-40"
        animate={{
          x: cursorPosition.x - 50,
          y: cursorPosition.y - 50,
          opacity: isMoving ? 0.6 : 0.2,
        }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 25,
        }}
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.1) 0%, transparent 70%)",
          filter: "blur(10px)",
        }}
      />

      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none z-30">
        <AnimatePresence>
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              initial={{
                x: particle.x,
                y: particle.y,
                scale: 0,
                opacity: particle.opacity,
              }}
              animate={{
                x: particle.x + (Math.random() - 0.5) * 100,
                y: particle.y + (Math.random() - 0.5) * 100,
                scale: 1,
                opacity: 0,
              }}
              exit={{
                scale: 0,
                opacity: 0,
              }}
              transition={{
                duration: 2,
                ease: "easeOut",
              }}
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

      {/* Interactive Elements Glow */}
      <style jsx global>{`
        .interactive-glow {
          transition: all 0.3s ease;
        }
        
        .interactive-glow:hover {
          box-shadow: 0 0 30px rgba(167, 139, 250, 0.4);
          transform: translateY(-2px);
        }
        
        a:hover, button:hover {
          text-shadow: 0 0 10px rgba(167, 139, 250, 0.6);
        }
        
        /* Hide default cursor */
        * {
          cursor: none !important;
        }
        
        /* Show cursor on interactive elements */
        a, button, input, textarea, select {
          cursor: pointer !important;
        }
      `}</style>
    </>
  )
}
