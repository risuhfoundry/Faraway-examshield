"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, MessageSquare, ShieldBan } from "lucide-react";
import type { AlertRecord, EvidenceListResponse } from "@/lib/evidence-types";
import { formatEvidenceDateTime, formatEvidenceTime } from "@/lib/evidence-format";

const emptyState: EvidenceListResponse = {
  evidence: [],
  activity: [],
  jobs: [],
  attributions: [],
  watermarks: [],
  forensicReports: [],
  telegramEvents: [],
  alerts: [],
  stats: {
    totalEvidence: 0,
    pendingAnalysis: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  },
};

export default function AlertCenter() {
  const [data, setData] = useState<EvidenceListResponse>(emptyState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadAlerts() {
      try {
        const response = await fetch("/evidence", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as EvidenceListResponse;
        if (active) {
          setData(payload);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAlerts();
    const interval = window.setInterval(loadAlerts, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const criticalAlerts = useMemo(
    () => data.alerts.filter((alert) => alert.risk === "critical"),
    [data.alerts],
  );

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-heading font-bold tracking-widest text-white uppercase">
            Critical Alerts
          </h1>
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-2">
            Automatic leak alerts generated from forensic confidence.
          </p>
        </div>
        <div className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-widest flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {criticalAlerts.length} Critical Active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {data.alerts.map((alert, index) => (
            <AlertCard
              key={alert.alertId}
              alert={alert}
              index={index}
              filename={
                data.evidence.find((item) => item.evidenceId === alert.evidenceId)?.filename ??
                "Stored evidence"
              }
            />
          ))}

          {!loading && data.alerts.length === 0 && (
            <div className="border border-dashed border-white/10 p-10 text-center text-sm text-white/45">
              No critical leak alerts generated yet.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-5 border border-white/10">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60 mb-5">
              Monitoring Status
            </h3>
            <div className="space-y-4 text-sm">
              <StatusRow label="Telegram Events" value={String(data.telegramEvents.length)} />
              <StatusRow label="Evidence Records" value={String(data.stats.totalEvidence)} />
              <StatusRow label="Critical Alerts" value={String(criticalAlerts.length)} />
            </div>
          </div>

          <div className="glass-panel p-5 border border-white/10">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60 mb-5">
              Latest Telegram Intake
            </h3>
            {data.telegramEvents.slice(0, 4).map((event) => (
              <div key={event.eventId} className="border-t border-white/10 py-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-white">{event.evidenceId ?? "TEXT"}</span>
                  <span className="text-[10px] uppercase tracking-widest text-white/40">
                    {formatEvidenceTime(event.timestamp)}
                  </span>
                </div>
                <div className="text-xs text-white/45 mt-1 truncate">
                  {event.filename ?? event.text ?? event.chatId}
                </div>
              </div>
            ))}
            {!loading && data.telegramEvents.length === 0 && (
              <div className="text-sm text-white/40">No Telegram events received.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  filename,
  index,
}: {
  alert: AlertRecord;
  filename: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass-panel p-5 border border-white/10 hover:border-white/30 transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white text-black">
            <ShieldBan className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono text-white tracking-wider">{alert.alertId}</span>
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 bg-white text-black font-bold">
                {alert.risk}
              </span>
            </div>
            <h2 className="text-2xl font-heading uppercase tracking-widest text-white mt-3">
              Critical Leak Detected
            </h2>
            <div className="text-sm text-white/50 mt-2 break-all">{filename}</div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-4xl font-heading text-white">{alert.confidence}%</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1">
            Confidence
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/10 text-sm">
        <InfoBlock label="Paper" value={alert.paperId ?? "Unknown"} />
        <InfoBlock label="Watermark" value={alert.watermarkId ?? "Unknown"} />
        <InfoBlock label="Center" value={alert.centerCode ?? "Unknown"} />
        <InfoBlock label="Time" value={formatEvidenceDateTime(alert.createdAt)} />
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs text-white/45">
        <MessageSquare className="w-4 h-4" />
        <span>Generated automatically after forensic investigation completed.</span>
      </div>
    </motion.div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <span className="text-white/45">{label}</span>
      <span className="font-mono text-white">{value}</span>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/35 uppercase tracking-widest text-[10px] mb-1">{label}</div>
      <div className="text-white/85">{value}</div>
    </div>
  );
}
