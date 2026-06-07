"use client";

import { motion } from "framer-motion";
import { Crosshair, AlertOctagon, Activity, RadioTower } from "lucide-react";

const riskBars = [
  24, 48, 36, 72, 54, 28, 67, 81, 44, 59, 76, 38,
  63, 88, 51, 34, 69, 57, 42, 79, 61, 46, 83, 55,
];

export default function ThreatIntelligence() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Threat Intelligence</h1>
        <p className="text-white/60 text-sm mt-1">AI-driven risk prediction and live threat streams.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        {/* Threat Stream Feed */}
        <div className="lg:col-span-1 glass-panel rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <RadioTower className="w-4 h-4 text-brand" />
              Live Events Feed
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
             <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5" />
             {[...Array(8)].map((_, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={i} 
                  className="relative pl-8 flex flex-col gap-1"
                >
                   <div className="absolute left-[7px] top-1.5 w-2 h-2 rounded-full bg-brand ring-4 ring-background" />
                   <span className="text-xs text-brand font-mono">14:0{i}:{i*5} Z</span>
                   <span className="text-sm text-white/80">Multiple failed access attempts detected at Node 0x{i}F9</span>
                   <span className="text-xs text-white/40">Source IP spoofing suspected.</span>
                </motion.div>
             ))}
          </div>
        </div>

        {/* Risk Prediction Models */}
        <div className="lg:col-span-2 flex flex-col gap-6">
           <div className="glass-panel rounded-xl p-6 flex-1 flex flex-col border border-white/5">
              <h3 className="font-medium text-sm text-white mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                AI Risk Prediction Model
              </h3>
              <div className="flex-1 flex items-end gap-2">
                 {riskBars.map((height, i) => (
                    <motion.div 
                       key={i}
                       className="flex-1 bg-white/5 rounded-t-sm relative group overflow-hidden"
                       initial={{ height: 0 }}
                       animate={{ height: `${height}%` }}
                       transition={{ duration: 1, delay: i * 0.05 }}
                    >
                       <div className="absolute inset-0 bg-gradient-to-t from-transparent to-brand/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                 ))}
              </div>
              <div className="mt-4 flex justify-between text-xs text-white/40">
                 <span>T-24h</span>
                 <span>Now</span>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
              <div className="glass-panel rounded-xl p-6 border border-rose-500/20 bg-rose-500/5 relative overflow-hidden">
                 <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-500/20 blur-2xl rounded-full" />
                 <AlertOctagon className="w-6 h-6 text-rose-400 mb-4" />
                 <div className="text-2xl font-semibold text-white mb-1">Critical Risk</div>
                 <div className="text-sm text-white/60">Paper transit sector 4 compromised.</div>
                 <button className="mt-4 px-4 py-2 bg-rose-500/10 text-rose-400 text-xs font-medium rounded-md border border-rose-500/20 hover:bg-rose-500/20 transition-colors">
                    Initiate Protocol
                 </button>
              </div>
              
              <div className="glass-panel rounded-xl p-6 border border-white/5 relative overflow-hidden">
                 <div className="absolute -right-6 -top-6 w-24 h-24 bg-brand/20 blur-2xl rounded-full" />
                 <Crosshair className="w-6 h-6 text-brand mb-4" />
                 <div className="text-2xl font-semibold text-white mb-1">Target Identified</div>
                 <div className="text-sm text-white/60">Forensic watermark match in leaked image.</div>
                 <button className="mt-4 px-4 py-2 bg-brand/10 text-brand text-xs font-medium rounded-md border border-brand/20 hover:bg-brand/20 transition-colors">
                    View Tracing
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
