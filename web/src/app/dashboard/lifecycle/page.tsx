"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FilePlus, Eye, Droplets, Fingerprint, FileText, CheckCircle, Clock, AlertOctagon } from "lucide-react";
import type { ForensicReport } from "@/lib/evidence-types";
import { formatEvidenceTime } from "@/lib/evidence-format";
import { useEvidenceFeed } from "@/lib/use-evidence-feed";

const investigationStages = [
  { id: "upload", label: "Upload", icon: FilePlus },
  { id: "ocr", label: "OCR Scan", icon: Eye },
  { id: "watermark", label: "Watermark", icon: Droplets },
  { id: "attribution", label: "Attribution", icon: Fingerprint },
  { id: "report", label: "Report", icon: FileText },
];

function getReportStage(report: ForensicReport): number {
  if (report.status === "no-match") return 5;
  if (report.status === "investigation-complete" && report.finalConfidence > 0) return 5;
  if (report.watermarkConfidence && report.watermarkConfidence > 0) return 4;
  if (report.ocrConfidence && report.ocrConfidence > 0) return 3;
  return 2;
}

export default function ExamLifecycle() {
  const { data } = useEvidenceFeed({ intervalMs: 5000 });
  const [selected, setSelected] = useState<ForensicReport | null>(null);

  const reports = data.forensicReports;
  const activeReports = reports.filter((r) => r.status === "investigation-complete" && r.finalConfidence > 50);
  const noMatch = reports.filter((r) => r.status === "no-match");

  if (reports.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Exam Lifecycle Monitor</h1>
          <p className="text-white/60 text-sm mt-1">Cryptographic state tracking for national examinations.</p>
        </div>
        <div className="glass-panel rounded-xl p-12 border border-white/5 flex flex-col items-center justify-center text-center text-white/40 gap-4">
          <Clock className="w-10 h-10 text-white/20" />
          <div>
            <div className="text-lg font-medium text-white">No Exams Tracked</div>
            <p className="text-sm mt-2 max-w-sm">Submit evidence through the forensic pipeline to begin tracking exam lifecycle stages.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Exam Lifecycle Monitor</h1>
        <p className="text-white/60 text-sm mt-1">
          Tracking {reports.length} forensic report{reports.length !== 1 ? "s" : ""}
          {activeReports.length > 0 && ` — ${activeReports.length} match${activeReports.length !== 1 ? "es" : ""}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="lg:col-span-1 glass-panel rounded-xl flex flex-col overflow-hidden border border-white/5">
          <div className="p-4 border-b border-white/5 bg-black/40">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/50">Forensic Reports</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {reports.map((report) => {
              const stage = getReportStage(report);
              const isSelected = selected?.reportId === report.reportId;
              return (
                <button
                  key={report.reportId}
                  onClick={() => setSelected(report)}
                  className={`w-full text-left p-4 border-b border-white/5 transition-colors ${
                    isSelected
                      ? "bg-white/10 border-l-2 border-l-brand"
                      : "hover:bg-white/[0.03] border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white font-medium truncate">
                      {report.paperIdentified ?? "Unidentified Paper"}
                    </span>
                    {report.status === "investigation-complete" && report.finalConfidence > 50 ? (
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/40">
                    <span className="font-mono">{report.centerCode ?? "N/A"}</span>
                    <span>{report.finalConfidence}%</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {investigationStages.map((s, i) => (
                      <div
                        key={s.id}
                        className={`h-1 flex-1 rounded-full ${
                          i < stage ? "bg-brand" : "bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {selected ? (
            <>
              {/* Paper Header */}
              <div className="glass-panel rounded-xl p-6 border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.05)_0%,transparent_70%)]" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-medium text-white">
                        {selected.paperIdentified ?? "Unidentified Paper"}
                      </h2>
                      <div className="text-sm text-brand font-mono mt-1">ID: {selected.reportId}</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      selected.status === "investigation-complete" && selected.finalConfidence > 50
                        ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                        : "bg-white/5 border border-white/10 text-white/40"
                    }`}>
                      {selected.status === "investigation-complete" && selected.finalConfidence > 50
                        ? "MATCH CONFIRMED"
                        : selected.status === "no-match"
                        ? "NO MATCH"
                        : "UNDER INVESTIGATION"}
                    </div>
                  </div>

                  {/* Stage Progress */}
                  <div className="relative pt-4 pb-2">
                    <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/5 -translate-y-1/2 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-brand"
                        initial={{ width: 0 }}
                        animate={{ width: `${(getReportStage(selected) / 5) * 100}%` }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                      />
                    </div>
                    <div className="relative flex justify-between">
                      {investigationStages.map((stage, i) => {
                        const stageNum = i + 1;
                        const currentStage = getReportStage(selected);
                        const isCompleted = stageNum <= currentStage;
                        const isActive = stageNum === currentStage;
                        return (
                          <div key={stage.id} className="flex flex-col items-center gap-3 relative z-10">
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: i * 0.15, type: "spring", stiffness: 300 }}
                              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                                isCompleted && !isActive
                                  ? "bg-brand/20 border-brand text-brand shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                                  : isActive
                                  ? "bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                                  : "bg-[#0a0a0c] border-white/10 text-white/40"
                              }`}
                            >
                              <stage.icon className={`w-4 h-4 ${isActive ? "animate-pulse" : ""}`} />
                            </motion.div>
                            <div className="text-center">
                              <div className={`text-xs font-medium ${
                                isCompleted ? "text-white" : isActive ? "text-amber-500" : "text-white/40"
                              }`}>
                                {stage.label}
                              </div>
                              {isCompleted && !isActive && (
                                <div className="text-[10px] text-brand font-mono mt-1">DONE</div>
                              )}
                              {isActive && (
                                <div className="text-[10px] text-amber-500 font-mono mt-1">ACTIVE</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Report Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-panel rounded-xl p-6 border border-white/5">
                  <h3 className="font-medium text-white mb-4">Investigation Details</h3>
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-white/40">Paper</span>
                      <span className="text-white">{selected.paperIdentified ?? "—"}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-white/40">Center Code</span>
                      <span className="text-brand">{selected.centerCode ?? "—"}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-white/40">Printer ID</span>
                      <span className="text-white/80">{selected.printerId ?? "—"}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-white/40">Batch ID</span>
                      <span className="text-white/80">{selected.batchId ?? "—"}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-white/40">Watermark ID</span>
                      <span className="text-white/80">{selected.watermarkId ?? "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-6 border border-white/5">
                  <h3 className="font-medium text-white mb-4">Confidence Scores</h3>
                  <div className="space-y-4">
                    {[
                      { label: "OCR Confidence", value: selected.ocrConfidence, color: "text-brand" },
                      { label: "Watermark Confidence", value: selected.watermarkConfidence, color: "text-blue-400" },
                      { label: "Final Confidence", value: selected.finalConfidence, color: selected.finalConfidence > 50 ? "text-rose-400" : "text-white" },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/60">{item.label}</span>
                          <span className={item.color}>{item.value ?? "—"}{item.value ? "%" : ""}</span>
                        </div>
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${item.color === "text-rose-400" ? "bg-rose-400" : "bg-brand"}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${item.value ?? 0}%` }}
                            transition={{ duration: 1 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-xs text-white/30 font-mono">
                    Reported: {formatEvidenceTime(selected.timestamp)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-panel rounded-xl p-12 border border-white/5 flex flex-col items-center justify-center text-center text-white/40 gap-4 h-full">
              <FileText className="w-10 h-10 text-white/20" />
              <div>
                <div className="text-lg font-medium text-white">Select a Report</div>
                <p className="text-sm mt-2 max-w-sm">Click on a forensic report from the list to view its lifecycle and investigation details.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
