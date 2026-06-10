"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out px-6 md:px-12 py-6",
          scrolled || mobileMenuOpen ? "bg-black/80 backdrop-blur-xl border-b border-white/10" : "bg-transparent"
        )}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group relative z-50" onClick={() => setMobileMenuOpen(false)}>
            <span className="font-heading font-bold text-xl md:text-xl tracking-[0.2em] text-white">EXAMSHIELD</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-12 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#design" className="hover:text-white transition-colors">Design</Link>
            <Link href="#specs" className="hover:text-white transition-colors">Specs</Link>
          </nav>

          <div className="hidden md:flex items-center gap-6">
            <Link href="/login" className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors">
              Log In
            </Link>
            <Link href="/signup">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-2.5 bg-white text-black text-xs font-semibold uppercase tracking-[0.1em] rounded-full hover:bg-white/90 transition-colors"
              >
                Sign Up
              </motion.button>
            </Link>
          </div>

          <button 
            className="md:hidden relative z-50 text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%", transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-2xl flex flex-col justify-center px-6 md:hidden"
          >
            <nav className="flex flex-col gap-8">
              {['Features', 'Design', 'Specs'].map((item, i) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                >
                  <Link 
                    href={`#${item.toLowerCase()}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-4xl font-heading font-bold uppercase tracking-widest text-white/80 hover:text-white transition-colors"
                  >
                    {item}
                  </Link>
                </motion.div>
              ))}
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-8 flex flex-col gap-4"
              >
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <button className="w-full py-5 border border-white/20 text-white text-sm font-bold uppercase tracking-[0.2em] rounded-none hover:bg-white/5 transition-colors">
                    Log In
                  </button>
                </Link>
                <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                  <button className="w-full py-5 bg-white text-black text-sm font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                    Sign Up
                  </button>
                </Link>
              </motion.div>
            </nav>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="absolute bottom-12 left-6 right-6 flex justify-between items-center border-t border-white/10 pt-6"
            >
              <span className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Secure Access</span>
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
