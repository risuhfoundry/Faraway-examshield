"use client";

import { motion } from "framer-motion";
import { FilePlus, Lock, CheckCircle, Send, Unlock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const stages = [
  { id: "created", label: "Created", icon: FilePlus, status: "completed" },
  { id: "encrypted", label: "Encrypted", icon: Lock, status: "completed" },
  { id: "approved", label: "Approved", icon: CheckCircle, status: "completed" },
  { id: "distributed", label: "Distributed", icon: Send, status: "completed" },
  { id: "released", label: "Released", icon: Unlock, status: "active" },
  { id: "active", label: "Exam Active", icon: PlayCircle, status: "pending" },
];

export default function ExamLifecycle() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Exam Lifecycle Monitor</h1>
        <p className="text-white/60 text-sm mt-1">Cryptographic state tracking for national examinations.</p>
      </div>

      <div className="glass-panel rounded-xl p-8 border border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.05)_0%,transparent_70%)]" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-xl font-medium text-white">Advanced Mathematics Paper 1</h2>
              <div className="text-sm text-brand font-mono mt-1">ID: EXM-2026-MATH-01</div>
            </div>
            <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium animate-pulse">
              DECRYPTION IN PROGRESS
            </div>
          </div>

          <div className="relative pt-8 pb-4">
            {/* Connecting Line */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/5 -translate-y-1/2 rounded-full overflow-hidden">
               <motion.div 
                 className="h-full bg-brand"
                 initial={{ width: 0 }}
                 animate={{ width: "80%" }}
                 transition={{ duration: 2, ease: "easeInOut" }}
               />
            </div>

            <div className="relative flex justify-between">
              {stages.map((stage, i) => {
                const isCompleted = stage.status === "completed";
                const isActive = stage.status === "active";
                
                return (
                  <div key={stage.id} className="flex flex-col items-center gap-4 relative z-10">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.2, type: "spring", stiffness: 300 }}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors",
                        isCompleted ? "bg-brand/20 border-brand text-brand shadow-[0_0_15px_rgba(56,189,248,0.3)]" :
                        isActive ? "bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.4)]" :
                        "bg-[#0a0a0c] border-white/10 text-white/40"
                      )}
                    >
                      <stage.icon className={cn("w-5 h-5", isActive && "animate-pulse")} />
                    </motion.div>
                    <div className="text-center">
                      <div className={cn(
                        "text-sm font-medium",
                        isCompleted ? "text-white" : isActive ? "text-amber-500" : "text-white/40"
                      )}>
                        {stage.label}
                      </div>
                      {isCompleted && <div className="text-[10px] text-brand font-mono mt-1">VERIFIED</div>}
                      {isActive && <div className="text-[10px] text-amber-500 font-mono mt-1">PROCESSING</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel rounded-xl p-6 border border-white/5">
           <h3 className="font-medium text-white mb-4">Cryptographic Signatures</h3>
           <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                 <span className="text-white/40">Hash (SHA-256)</span>
                 <span className="text-brand">8f4e...2a9c</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                 <span className="text-white/40">Authority Signature</span>
                 <span className="text-emerald-400">Valid</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                 <span className="text-white/40">Encryption Type</span>
                 <span className="text-white/80">AES-256-GCM</span>
              </div>
           </div>
        </div>

        <div className="glass-panel rounded-xl p-6 border border-white/5">
           <h3 className="font-medium text-white mb-4">Distribution Metrics</h3>
           <div className="space-y-4">
              <div>
                 <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">Centers Synced</span>
                    <span className="text-white">1,150 / 1,204</span>
                 </div>
                 <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-brand h-full rounded-full" style={{ width: '95%' }} />
                 </div>
              </div>
              <div>
                 <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">Decryption Keys Delivered</span>
                    <span className="text-white">840 / 1,204</span>
                 </div>
                 <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: '70%' }} />
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
