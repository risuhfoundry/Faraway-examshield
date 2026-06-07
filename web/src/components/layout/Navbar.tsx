"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out px-6 md:px-12 py-6",
        scrolled ? "bg-black/80 backdrop-blur-xl border-b border-white/10" : "bg-transparent"
      )}
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-heading font-bold text-xl tracking-[0.2em] text-white">EXAMSHIELD</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-12 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
          <Link href="#features" className="hover:text-white transition-colors">Features</Link>
          <Link href="#design" className="hover:text-white transition-colors">Design</Link>
          <Link href="#specs" className="hover:text-white transition-colors">Specs</Link>
        </nav>

        <div className="flex items-center">
          <Link href="/dashboard">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-2.5 bg-white text-black text-xs font-semibold uppercase tracking-[0.1em] rounded-full hover:bg-white/90 transition-colors"
            >
              Enter Command
            </motion.button>
          </Link>
        </div>
      </div>
    </header>
  );
}
