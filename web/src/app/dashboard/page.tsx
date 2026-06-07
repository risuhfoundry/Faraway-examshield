"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ShieldAlert, Server, AlertTriangle, Crosshair, FileUp } from "lucide-react";
import type { EvidenceListResponse } from "@/lib/evidence-types";
import {
  formatEvidenceSource,
  formatEvidenceStatus,
  formatEvidenceTime,
} from "@/lib/evidence-format";

const mapBlips = [
  { left: "18%", top: "22%", delay: 0.2 },
  { left: "72%", top: "18%", delay: 1.1 },
  { left: "56%", top: "42%", delay: 0.7 },
  { left: "24%", top: "68%", delay: 1.8 },
  { left: "82%", top: "74%", delay: 2.4 },
  { left: "38%", top: "84%", delay: 1.4 },
  { left: "64%", top: "58%", delay: 0.4 },
  { left: "12%", top: "48%", delay: 2.1 },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

export default function Dashboard() {
  const [evidenceData, setEvidenceData] = useState<EvidenceListResponse | null>(null);
  const criticalAlerts = evidenceData?.alerts.filter((alert) => alert.risk === "critical").length ?? 0;
  const telegramEvents = evidenceData?.telegramEvents.length ?? 0;
  const stats = [
    { label: "Active Exams", value: "142", trend: "+12", icon: Activity },
    {
      label: "Critical Alerts",
      value: String(criticalAlerts),
      trend: criticalAlerts > 0 ? "Alert" : "Clear",
      icon: AlertTriangle,
    },
    { label: "Telegram Events", value: String(telegramEvents), trend: "Live", icon: ShieldAlert },
    { label: "Active Centers", value: "1,204", trend: "+45", icon: Server },
  ];

  useEffect(() => {
    let active = true;

    async function loadEvidence() {
      const response = await fetch("/evidence", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as EvidenceListResponse;
      if (active) {
        setEvidenceData(payload);
      }
    }

    loadEvidence();
    const interval = window.setInterval(loadEvidence, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <div className="flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-heading font-bold tracking-widest text-white uppercase">Command Center</h1>
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-2">Real-time overview of national examination security grid.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div key={i} variants={itemVariants} className="glass-panel p-6 flex flex-col relative overflow-hidden group hover:bg-white/[0.02]">
            <div className="flex items-center gap-4 mb-8">
              <div className={`p-3 rounded-sm bg-white/5 border border-white/10 group-hover:border-white/30 transition-colors`}>
                <stat.icon className={`w-5 h-5 text-white`} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-white/50">{stat.label}</span>
            </div>
            <div className="flex items-baseline justify-between mt-auto">
              <span className="text-4xl font-heading font-bold text-white tracking-tight">{stat.value}</span>
              <span className={`text-xs font-mono uppercase ${stat.trend === 'Alert' ? 'text-white font-bold bg-white/20 px-2 py-1' : 'text-white/50'}`}>
                {stat.trend}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Threat Map */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-panel h-[500px] flex flex-col relative overflow-hidden group">
           <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/50">Live Operations Grid</h3>
              <div className="flex items-center gap-3">
                 <span className="relative flex h-2 w-2">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                 </span>
                 <span className="text-xs text-white uppercase tracking-widest font-mono">Live Sync</span>
              </div>
           </div>
           <div className="flex-1 relative bg-black flex items-center justify-center p-6 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)]" />
              <div className="w-full h-full border border-white/10 relative overflow-hidden">
                 {/* Grid lines */}
                 <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
                 
                 {/* Scanning Line */}
                 <motion.div 
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-[1px] bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.5)] z-10"
                 />
                 
                 {/* Blips */}
                 {mapBlips.map((blip, i) => (
                   <motion.div 
                     key={i}
                     initial={{ opacity: 0, scale: 0 }}
                     animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 2] }}
                     transition={{ duration: 3, repeat: Infinity, delay: blip.delay }}
                     className="absolute w-4 h-4 rounded-full border border-white/50 bg-white/10"
                     style={{
                       left: blip.left,
                       top: blip.top,
                     }}
                   />
                 ))}

                 {/* High threat blip */}
                 <div className="absolute left-[40%] top-[30%]">
                   <motion.div 
                       animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }}
                       transition={{ duration: 1, repeat: Infinity }}
                       className="w-12 h-12 -ml-6 -mt-6 absolute rounded-full border border-white/30 bg-white/5 flex items-center justify-center"
                   >
                     <Crosshair className="w-4 h-4 text-white" />
                   </motion.div>
                 </div>
              </div>
           </div>
        </motion.div>

        {/* Activity Feed */}
        <motion.div variants={itemVariants} className="glass-panel h-[500px] flex flex-col">
          <div className="p-6 border-b border-white/10">
             <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/50">Live Monitoring Feed</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {evidenceData?.activity.map((event) => {
              const evidence = evidenceData.evidence.find((item) => item.evidenceId === event.evidenceId);

              return (
              <div key={event.eventId} className="p-4 bg-white/[0.02] border border-white/5 hover:border-white/20 transition-colors group flex flex-col gap-3">
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-white tracking-wider">{event.title}</span>
                    <span className="text-[10px] uppercase tracking-widest px-2 py-1 bg-white/10 text-white font-bold">
                      {formatEvidenceTime(event.timestamp)}
                    </span>
                 </div>
                 <span className="text-sm text-white/70 line-clamp-1 font-light">
                   Evidence #{event.evidenceId}
                 </span>
                 <div className="flex items-center justify-between gap-3 text-xs text-white/45">
                    <span className="truncate">{evidence?.filename ?? "Stored evidence"}</span>
                    <span className="shrink-0">
                      {evidence ? formatEvidenceSource(evidence.source) : "Monitoring"}
                    </span>
                 </div>
                 {evidence && (
                   <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-widest text-white/35">
                     <span>{formatEvidenceStatus(evidence.status)}</span>
                     {evidence.telegramMessageId && <span>MSG {evidence.telegramMessageId}</span>}
                   </div>
                 )}
              </div>
              );
            })}

            {(!evidenceData || evidenceData.activity.length === 0) && (
              <div className="h-full flex flex-col items-center justify-center text-center text-white/40 gap-3 px-6">
                <FileUp className="w-7 h-7 text-white/30" />
                <p className="text-sm">Evidence uploads will appear here.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
