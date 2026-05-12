
import { useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.04, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }
  }),
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.25 } },
};

export const sidebarIconVariants = {
  rest: { scale: 1, rotate: 0 },
  hover: { scale: 1.15, rotate: 2, transition: { type: 'spring', stiffness: 400, damping: 15 } },
  tap: { scale: 0.9 },
};

export const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const panelVariants = {
  hidden: { x: '100%', opacity: 0.5 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.25, ease: 'easeIn' } },
};

export const sheetVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 28 } },
  exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.2 } },
};

export const toastVariants = {
  hidden: { opacity: 0, y: 20, x: 20, scale: 0.85 },
  visible: { opacity: 1, y: 0, x: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 22 } },
  exit: { opacity: 0, x: 40, scale: 0.8, transition: { duration: 0.3 } },
};

export const dragOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const popupVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 5 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 500, damping: 28 } },
  exit: { opacity: 0, scale: 0.9, y: 5, transition: { duration: 0.15 } },
};

export const emptyStateVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export function useGsapLogoEntrance(ref) {
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current,
      { opacity: 0, y: -30, rotateZ: 5 },
      { opacity: 1, y: 0, rotateZ: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)', delay: 0.3 }
    );
  }, [ref]);
}

export function useGsapSidebarIcons(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const icons = ref.current.querySelectorAll('.side-icon');
    gsap.fromTo(icons,
      { opacity: 0, x: -20, scale: 0.7 },
      { opacity: 1, x: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(1.7)', delay: 0.6 }
    );
  }, [ref]);
}

function ParticleField() {
  const meshRef = useRef();
  const count = 120;

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      sz[i] = Math.random() * 3 + 1;
    }
    return [pos, sz];
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;
    const posArr = meshRef.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      posArr[i * 3 + 1] += Math.sin(time * 0.3 + i * 0.5) * 0.002;
      posArr[i * 3] += Math.cos(time * 0.2 + i * 0.3) * 0.001;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.rotation.y = time * 0.02;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#aaaaaa" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

export function AmbientParticles() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.6 }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 1.5]} style={{ background: 'transparent' }}>
        <ParticleField />
      </Canvas>
    </div>
  );
}
export { motion, AnimatePresence };
