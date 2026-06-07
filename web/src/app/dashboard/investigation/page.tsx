"use client";

import { motion } from "framer-motion";
import { Search, Scan, FileText, Share2, Clock } from "lucide-react";

export default function InvestigationWorkspace() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Investigation Workspace</h1>
          <p className="text-white/60 text-sm mt-1">Forensic analysis and watermark extraction.</p>
        </div>
        <div className="flex gap-3">
           <button className="px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-medium rounded-md hover:bg-white/10 transition-colors">
             Upload Evidence
           </button>
           <button className="px-4 py-2 bg-brand text-black text-sm font-semibold rounded-md shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:shadow-[0_0_25px_rgba(56,189,248,0.5)] transition-shadow">
             Run AI Analysis
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Analysis View */}
        <div className="lg:col-span-2 glass-panel rounded-xl flex flex-col min-h-[500px] border border-white/5 overflow-hidden">
           <div className="p-4 border-b border-white/5 bg-black/40 flex gap-4">
              <button className="text-sm font-medium text-white pb-4 border-b-2 border-brand -mb-4">Visual Analysis</button>
              <button className="text-sm font-medium text-white/50 pb-4 border-b-2 border-transparent -mb-4 hover:text-white">OCR Results</button>
              <button className="text-sm font-medium text-white/50 pb-4 border-b-2 border-transparent -mb-4 hover:text-white">Similarity Map</button>
           </div>
           
           <div className="flex-1 p-6 relative flex items-center justify-center bg-[#0a0a0c]">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px]" />
              
              {/* Fake Document Analysis */}
              <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="relative w-3/4 aspect-[1/1.4] bg-white/5 border border-white/10 rounded-sm p-8 shadow-2xl"
              >
                 <div className="w-full h-full border border-white/5 relative">
                    <div className="absolute top-4 left-4 right-4 h-4 bg-white/10 rounded-sm" />
                    <div className="absolute top-12 left-4 w-3/4 h-3 bg-white/5 rounded-sm" />
                    <div className="absolute top-20 left-4 w-full h-32 bg-white/5 rounded-sm" />
                    
                    {/* Scanner Line */}
                    <motion.div 
                       animate={{ top: ["0%", "100%", "0%"] }}
                       transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                       className="absolute left-0 right-0 h-0.5 bg-brand shadow-[0_0_10px_#38bdf8] z-10"
                    />

                    {/* Highlighted Watermark */}
                    <motion.div 
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       transition={{ delay: 2 }}
                       className="absolute bottom-12 right-8 w-16 h-16 border-2 border-rose-500 rounded-sm flex items-center justify-center bg-rose-500/10"
                    >
                       <Scan className="w-6 h-6 text-rose-500" />
                    </motion.div>
                 </div>
              </motion.div>
           </div>
        </div>

        {/* Tracing Info */}
        <div className="space-y-6">
           <div className="glass-panel rounded-xl p-5 border border-white/5">
              <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                 <Share2 className="w-4 h-4 text-brand" />
                 Source Tracing
              </h3>
              <div className="space-y-4">
                 <div>
                    <div className="text-xs text-white/40 mb-1">Extracted ID</div>
                    <div className="text-lg font-mono text-white">WMK-8829-1A</div>
                 </div>
                 <div>
                    <div className="text-xs text-white/40 mb-1">Origin Node</div>
                    <div className="text-sm text-white">Center 42, Sector B</div>
                 </div>
                 <div>
                    <div className="text-xs text-white/40 mb-1">Print Timestamp</div>
                    <div className="text-sm text-white">2026-06-07 08:14:22 UTC</div>
                 </div>
              </div>
           </div>

           <div className="glass-panel rounded-xl p-5 border border-white/5">
              <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                 <Clock className="w-4 h-4 text-white/60" />
                 Investigation Timeline
              </h3>
              <div className="relative pl-4 space-y-4">
                 <div className="absolute left-1.5 top-2 bottom-2 w-px bg-white/10" />
                 
                 <div className="relative">
                    <div className="absolute -left-4 top-1 w-2 h-2 rounded-full bg-brand" />
                    <div className="text-xs text-brand font-mono">10:42 AM</div>
                    <div className="text-sm text-white mt-0.5">Image uploaded</div>
                 </div>
                 <div className="relative">
                    <div className="absolute -left-4 top-1 w-2 h-2 rounded-full bg-brand" />
                    <div className="text-xs text-brand font-mono">10:43 AM</div>
                    <div className="text-sm text-white mt-0.5">Watermark extracted</div>
                 </div>
                 <div className="relative">
                    <div className="absolute -left-4 top-1 w-2 h-2 rounded-full border-2 border-white/20 bg-background" />
                    <div className="text-xs text-white/40 font-mono">Pending</div>
                    <div className="text-sm text-white/60 mt-0.5">Awaiting physical verification</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
