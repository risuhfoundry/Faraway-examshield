"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ShieldAlert, Server, AlertTriangle, FileUp } from "lucide-react";
import type { EvidenceListResponse } from "@/lib/evidence-types";
import {
  formatEvidenceSource,
  formatEvidenceStatus,
  formatEvidenceTime,
} from "@/lib/evidence-format";
import { ThreatMap } from "@/components/sections/ThreatMap";


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
        {/* National Threat Map */}
        <motion.div variants={itemVariants} className="hidden lg:flex lg:col-span-2 glass-panel h-[560px] flex-col relative overflow-hidden">
          <ThreatMap />
        </motion.div>

        {/* Activity Feed */}
        <motion.div variants={itemVariants} className="lg:col-span-1 glass-panel min-h-[400px] lg:h-[500px] flex flex-col">
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
              <div className="h-full flex flex-col items-center justify-center text-center text-white/40 gap-4 px-6">
                <FileUp className="w-8 h-8 text-white/25" />
                <div>
                  <div className="text-xl font-heading uppercase tracking-widest text-white">
                    No Active Investigations
                  </div>
                  <p className="text-sm text-white/45 mt-3 max-w-xs">
                    All monitored channels are clear. Evidence intake and alerts will stream here automatically.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
