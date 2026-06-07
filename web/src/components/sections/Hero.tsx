"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import Link from "next/link";
import { ArrowRight, MoveRight } from "lucide-react";
import { useEffect } from "react";

const containerVariants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1, 
    transition: { 
      staggerChildren: 0.2,
      delayChildren: 0.1,
    } 
  }
};

const textVariants = {
  initial: { opacity: 0, y: 50 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } }
};

const lineVariants = {
  initial: { width: "0%" },
  animate: { width: "100%", transition: { duration: 1.5, ease: [0.16, 1, 0.3, 1] as const } }
};

export function Hero() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-black">
      {/* Dynamic Grid Spotlight Background */}
      <motion.div 
        className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,#666_1px,transparent_1px)] bg-[size:40px_40px] opacity-70"
        style={{
          maskImage: useMotionTemplate`radial-gradient(500px circle at ${springX}px ${springY}px, black, transparent)`,
          WebkitMaskImage: useMotionTemplate`radial-gradient(500px circle at ${springX}px ${springY}px, black, transparent)`
        }}
      />
      
      {/* Static subtle background */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,#222_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 md:px-12 pt-32 pb-20 z-10">
        <motion.div 
          variants={containerVariants}
          initial="initial"
          animate="animate"
          className="w-full max-w-7xl mx-auto flex flex-col items-center text-center"
        >
          <motion.div variants={textVariants} className="flex items-center gap-4 mb-8">
            <div className="h-px w-8 bg-white/50" />
            <span className="text-xs uppercase tracking-[0.3em] text-white/50 font-medium font-sans">The New Standard</span>
            <div className="h-px w-8 bg-white/50" />
          </motion.div>

          <div className="relative group cursor-default">
            {/* Outline text layer for hover effect */}
            <motion.h1 
              variants={textVariants}
              className="text-[14vw] md:text-[160px] leading-[0.8] font-bold tracking-tighter text-transparent font-heading absolute top-0 left-0 z-0 transition-transform duration-700 group-hover:scale-105 group-hover:translate-x-6 group-hover:translate-y-6"
              style={{ WebkitTextStroke: '2px rgba(255,255,255,0.15)' }}
            >
              EXAMSHIELD
            </motion.h1>
            
            {/* Solid text layer */}
            <motion.h1 
              variants={textVariants}
              className="text-[14vw] md:text-[160px] leading-[0.8] font-bold tracking-tighter text-white font-heading relative z-20 transition-transform duration-700 group-hover:scale-105"
            >
              EXAMSHIELD
            </motion.h1>
            
            <motion.h1 
              variants={textVariants}
              className="text-[10vw] md:text-[120px] leading-[0.85] font-bold tracking-tighter text-white/20 font-heading mt-2 relative z-20 transition-transform duration-700 group-hover:scale-[1.02]"
            >
              SERIES X
            </motion.h1>
            
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1, duration: 0.8, ease: "easeOut" }}
              className="absolute top-[40%] -right-8 md:-right-16 -translate-y-1/2 w-16 h-16 rounded-full border border-white/20 flex items-center justify-center mix-blend-difference z-30"
            >
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)]" 
              />
            </motion.div>
          </div>

          <motion.p 
            variants={textVariants}
            className="mt-14 text-lg md:text-xl text-white/60 max-w-2xl font-light leading-relaxed font-sans"
          >
            Absolute clarity in examination security. Zero-trust architecture, forensic tracking, and real-time threat intelligence engineered for national scale.
          </motion.p>

          <motion.div 
            variants={textVariants}
            className="mt-16 flex flex-col sm:flex-row items-center gap-8"
          >
            <Link href="/dashboard">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-5 bg-white text-black text-sm uppercase tracking-widest font-bold rounded-full flex items-center gap-3 hover:bg-white/90 transition-colors shadow-[0_0_40px_rgba(255,255,255,0.2)]"
              >
                Secure Yours <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
            <button className="px-8 py-4 text-white text-sm uppercase tracking-widest font-bold flex items-center gap-3 group relative overflow-hidden">
               <span className="relative z-10 group-hover:text-black transition-colors duration-300">Watch Film</span>
               <MoveRight className="w-4 h-4 relative z-10 group-hover:text-black transition-colors duration-300 group-hover:translate-x-2" />
               <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
            </button>
          </motion.div>
        </motion.div>
      </div>

      {/* Decorative Bottom Bar - Now inside the flex flow to prevent overlapping */}
      <div className="w-full px-6 md:px-12 pb-8 flex justify-between items-end relative z-10 shrink-0">
        <div className="text-xs text-white/30 uppercase tracking-[0.2em] font-sans">
          01 / SYSTEM
        </div>
        <div className="hidden md:block flex-1 px-12">
          <motion.div 
            variants={lineVariants}
            initial="initial"
            animate="animate"
            className="w-full h-px bg-white/10 relative overflow-hidden"
          >
            <motion.div 
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute top-0 left-0 w-32 h-px bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]" 
            />
          </motion.div>
        </div>
        <div className="text-xs text-white/30 uppercase tracking-[0.2em] font-sans flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          ACTIVE
        </div>
      </div>
    </section>
  );
}
