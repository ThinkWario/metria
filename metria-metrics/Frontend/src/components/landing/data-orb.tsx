"use client"

import { useRef, useMemo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Float, MeshDistortMaterial, Sphere, PerspectiveCamera } from "@react-three/drei"
import * as THREE from "three"

function Orb() {
  const meshRef = useRef<THREE.Mesh>(null)
  
  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.getElapsedTime()
    meshRef.current.rotation.x = Math.cos(t / 4) / 4
    meshRef.current.rotation.y = Math.sin(t / 4) / 4
    meshRef.current.position.y = Math.sin(t / 1.5) / 10
  })

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <Sphere ref={meshRef} args={[1, 64, 64]} scale={1.5}>
        <MeshDistortMaterial
          color="#10b981"
          speed={3}
          distort={0.4}
          radius={1}
          metalness={0.9}
          roughness={0.1}
          emissive="#06b6d4"
          emissiveIntensity={0.2}
          transparent
          opacity={0.8}
        />
      </Sphere>
    </Float>
  )
}

export function DataOrbScene() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none h-screen bg-black">
      <Canvas dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 8]} />
        <ambientLight intensity={0.2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} color="#06b6d4" />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} color="#10b981" />
        <pointLight position={[0, -5, 5]} intensity={0.5} color="#06b6d4" />
        <Orb />
        {/* Floating particles (conceptual) */}
        <mesh position={[2, 1, 0]}>
           <sphereGeometry args={[0.02, 16, 16]} />
           <meshBasicMaterial color="#10b981" transparent opacity={0.3} />
        </mesh>
        <mesh position={[-3, -2, -1]}>
           <sphereGeometry args={[0.03, 16, 16]} />
           <meshBasicMaterial color="#06b6d4" transparent opacity={0.2} />
        </mesh>
      </Canvas>
    </div>
  )
}
