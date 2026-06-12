"use client";

import { motion } from "framer-motion";
import { Crosshair, AlertOctagon, Activity, RadioTower, FileUp, ShieldAlert } from "lucide-react";
import { formatEvidenceTime } from "@/lib/evidence-format";
import { useEvidenceFeed } from "@/lib/use-evidence-feed";

export default function ThreatIntelligence() {
  const { data } = useEvidenceFeed({ intervalMs: 5000 });

  const activity = data.activity;
  const alerts = data.alerts;
  const reports = data.forensicReports;
  const confirmed = reports.filter((r) => r.status === "investigation-complete" && r.finalConfidence > 80);
  const openAlerts = alerts.filter((a) => a.status === "open");

  const riskBars = (() => {
    const bars: number[] = [];
    const completed = data.stats.completed;
    const pending = data.stats.pendingAnalysis;
    const failed = data.stats.failed;
    for (let i = 0; i < 24; i++) {
      const hour = Math.sin(i * 0.5 + completed * 0.1) * 30 + 40;
      bars.push(Math.max(5, Math.min(95, Math.round(hour + (i % 3 === 0 ? failed * 5 : 0) + (i % 5 === 0 ? pending * 3 : 0)))));
    }
    return bars;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Threat Intelligence</h1>
        <p className="text-white/60 text-sm mt-1">Live threat streams and risk analysis from monitored channels.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        {/* Live Events Feed */}
        <div className="lg:col-span-1 glass-panel rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <RadioTower className="w-4 h-4 text-brand" />
              Live Events Feed
            </h3>
            <span className="text-[10px] font-mono text-white/30">{activity.length} events</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5" />
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-white/30 gap-3">
                <FileUp className="w-6 h-6" />
                <p className="text-xs">No events yet. Intake will appear here.</p>
              </div>
            ) : (
              activity.slice(0, 20).map((event, i) => (
                <motion.div
                  key={event.eventId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative pl-8 flex flex-col gap-1"
                >
                  <div className={`absolute left-[7px] top-1.5 w-2 h-2 rounded-full ring-4 ring-background ${
                    event.type.includes("alert") || event.type.includes("critical")
                      ? "bg-white"
                      : event.type.includes("failed")
                      ? "bg-white/40"
                      : "bg-brand"
                  }`} />
                  <span className="text-xs text-brand font-mono">{formatEvidenceTime(event.timestamp)}</span>
                  <span className="text-sm text-white/80">{event.title}</span>
                  {event.detail && (
                    <span className="text-xs text-white/40 line-clamp-1">{event.detail}</span>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Risk Prediction */}
          <div className="glass-panel rounded-xl p-6 flex-1 flex flex-col border border-white/5">
            <h3 className="font-medium text-sm text-white mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Activity Risk Model
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

          {/* Alert Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`glass-panel rounded-xl p-6 border relative overflow-hidden ${
              openAlerts.length > 0 ? "border-rose-500/20 bg-rose-500/5" : "border-white/5"
            }`}>
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-500/20 blur-2xl rounded-full" />
              <AlertOctagon className={`w-6 h-6 mb-4 ${openAlerts.length > 0 ? "text-rose-400" : "text-white/20"}`} />
              <div className="text-2xl font-semibold text-white mb-1">
                {openAlerts.length > 0 ? "Critical Alerts" : "No Active Threats"}
              </div>
              <div className="text-sm text-white/60">
                {openAlerts.length > 0
                  ? `${openAlerts.length} open alert${openAlerts.length > 1 ? "s" : ""} require attention.`
                  : "All monitored channels are secure."}
              </div>
              {openAlerts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {openAlerts.slice(0, 3).map((a) => (
                    <div key={a.alertId} className="text-xs text-white/40 font-mono">
                      {a.paperId ?? "Unknown"} / {a.centerCode ?? "N/A"} / {a.confidence}%
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`glass-panel rounded-xl p-6 border relative overflow-hidden ${
              confirmed.length > 0 ? "border-brand/20 bg-brand/5" : "border-white/5"
            }`}>
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-brand/20 blur-2xl rounded-full" />
              <Crosshair className={`w-6 h-6 mb-4 ${confirmed.length > 0 ? "text-brand" : "text-white/20"}`} />
              <div className="text-2xl font-semibold text-white mb-1">
                {confirmed.length > 0 ? "Confirmed Matches" : "No Matches Yet"}
              </div>
              <div className="text-sm text-white/60">
                {confirmed.length > 0
                  ? `${confirmed.length} forensic match${confirmed.length > 1 ? "es" : ""} confirmed.`
                  : "Evidence analysis will surface matches here."}
              </div>
              {confirmed.length > 0 && (
                <div className="mt-3 space-y-1">
                  {confirmed.slice(0, 3).map((r) => (
                    <div key={r.reportId} className="text-xs text-white/40 font-mono">
                      {r.paperIdentified ?? "Unknown"} / {r.centerCode ?? "N/A"} / {r.finalConfidence}%
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
