"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import IndiaMap from "@svg-maps/india";
import { X, AlertTriangle, ShieldCheck, Search } from "lucide-react";
import type { EvidenceListResponse } from "@/lib/evidence-types";
import { buildThreatMapCenters, type ThreatMapCenter } from "@/lib/map-centers";

// Convert lat/lng to SVG coordinates for the @svg-maps/india viewBox (0 0 612 696)
function latLngToSvg(lat: number, lng: number): { x: number; y: number } {
  const LAT_MIN = 7.5, LAT_MAX = 37.5;
  const LNG_MIN = 67.5, LNG_MAX = 97.5;
  const SVG_W = 612, SVG_H = 696;
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_W;
  const y = SVG_H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * SVG_H;
  return { x, y };
}

const STATUS_CONFIG = {
  compromised: {
    fill: "rgba(255,255,255,0.9)",
    ring: "rgba(255,255,255,0.4)",
    label: "COMPROMISED",
    dotSize: 5,
  },
  investigating: {
    fill: "rgba(255,255,255,0.6)",
    ring: "rgba(255,255,255,0.2)",
    label: "INVESTIGATING",
    dotSize: 4,
  },
  secure: {
    fill: "rgba(255,255,255,0.25)",
    ring: "transparent",
    label: "SECURE",
    dotSize: 3,
  },
};

type ThreatMapProps = {
  evidenceData?: EvidenceListResponse;
};

export function ThreatMap({ evidenceData }: ThreatMapProps) {
  const [geoLookup, setGeoLookup] = useState<
    Array<Pick<ThreatMapCenter, "centerCode" | "name" | "city" | "state" | "lat" | "lng">>
  >([]);
  const [hoveredCenter, setHoveredCenter] = useState<ThreatMapCenter | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<ThreatMapCenter | null>(null);
  const [filter, setFilter] = useState<"all" | "compromised" | "investigating" | "secure">("all");
  const [pulsingId, setPulsingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/registry/centers.json")
      .then((r) => r.json())
      .then((data) => setGeoLookup(data.centers ?? []));
  }, []);

  const centers = useMemo(() => {
    if (!evidenceData) return [];
    return buildThreatMapCenters(evidenceData, geoLookup);
  }, [evidenceData, geoLookup]);

  useEffect(() => {
    if (centers.length === 0) return;
    const compromised = centers.filter((c) => c.status === "compromised");
    if (compromised.length === 0) return;
    const interval = setInterval(() => {
      const random = compromised[Math.floor(Math.random() * compromised.length)];
      setPulsingId(random.id);
      setTimeout(() => setPulsingId(null), 3000);
    }, 6000);
    return () => clearInterval(interval);
  }, [centers]);

  const filtered = filter === "all" ? centers : centers.filter((c) => c.status === filter);

  const stats = {
    compromised: centers.filter((c) => c.status === "compromised").length,
    investigating: centers.filter((c) => c.status === "investigating").length,
    secure: centers.filter((c) => c.status === "secure").length,
  };

  const nationalRisk = centers.length
    ? Math.round(centers.reduce((a, c) => a + c.risk, 0) / centers.length)
    : 0;
  const riskLabel = nationalRisk >= 70 ? "CRITICAL" : nationalRisk >= 40 ? "ELEVATED" : "LOW";

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
            National Examination Security Map
          </h3>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-white/30 font-mono">National Threat Index</span>
          <span className="text-base font-bold font-heading text-white">{nationalRisk}</span>
          <span className="text-white/20 text-xs font-mono">/ 100</span>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${
            nationalRisk >= 70
              ? "border-white/40 text-white bg-white/10"
              : nationalRisk >= 40
              ? "border-white/20 text-white/70 bg-white/5"
              : "border-white/10 text-white/40"
          }`}>
            {riskLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-5 py-2 border-b border-white/5 shrink-0">
        {(["all", "compromised", "investigating", "secure"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] border transition-all ${
              filter === f
                ? "border-white/30 bg-white/10 text-white"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {f === "all"
              ? `Evidence (${centers.length})`
              : f === "compromised"
              ? `● ${stats.compromised} Compromised`
              : f === "investigating"
              ? `◐ ${stats.investigating} Investigating`
              : `○ ${stats.secure} Secure`}
          </button>
        ))}
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#040406]">
        <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,#040406_95%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />

        <svg
          viewBox={IndiaMap.viewBox}
          className="w-full h-full"
          style={{ display: "block" }}
        >
          {IndiaMap.locations.map((loc: { id: string; path: string }) => (
            <path
              key={loc.id}
              d={loc.path}
              fill="#0c0e14"
              stroke="#ffffff18"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
          ))}

          {filtered.map((center) => {
            const cfg = STATUS_CONFIG[center.status];
            const { x, y } = latLngToSvg(center.lat, center.lng);
            const isPulsing = pulsingId === center.id;

            return (
              <g
                key={center.id}
                transform={`translate(${x}, ${y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredCenter(center)}
                onMouseLeave={() => setHoveredCenter(null)}
                onClick={() => setSelectedCenter(center)}
              >
                {center.status === "compromised" && (
                  <circle
                    r={isPulsing ? 12 : 7}
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1"
                    style={{
                      transition: "r 0.4s ease",
                      animation: "pulse-ring 2.5s ease-out infinite",
                    }}
                  />
                )}
                {center.status === "investigating" && (
                  <circle
                    r={5}
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="0.8"
                  />
                )}
                <circle
                  r={isPulsing ? cfg.dotSize + 2 : cfg.dotSize}
                  fill={cfg.fill}
                  style={{
                    transition: "r 0.3s ease, filter 0.3s ease",
                    filter: isPulsing
                      ? "drop-shadow(0 0 6px rgba(255,255,255,0.9))"
                      : center.status === "compromised"
                      ? "drop-shadow(0 0 3px rgba(255,255,255,0.5))"
                      : "none",
                  }}
                />
              </g>
            );
          })}
        </svg>

        {centers.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="border border-white/10 bg-black/80 px-6 py-4 text-center backdrop-blur-md">
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">No Evidence Markers</div>
              <p className="text-[11px] text-white/35 mt-2 max-w-xs">
                Map markers appear only when forensic evidence identifies an examination center.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {hoveredCenter && (
            <motion.div
              key={hoveredCenter.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            >
              <div className="bg-black/95 border border-white/10 px-4 py-3 min-w-[220px] backdrop-blur-md shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading font-bold text-white text-sm tracking-wider">
                    {hoveredCenter.centerCode}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${
                    hoveredCenter.status === "compromised"
                      ? "border-white/30 text-white bg-white/10"
                      : hoveredCenter.status === "investigating"
                      ? "border-white/15 text-white/60"
                      : "border-white/10 text-white/30"
                  }`}>
                    {STATUS_CONFIG[hoveredCenter.status].label}
                  </span>
                </div>
                <p className="text-xs text-white/40 mb-2 truncate">{hoveredCenter.name}</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                  {[
                    ["Risk", `${hoveredCenter.risk} / 100`],
                    ["Cases", String(hoveredCenter.activeCases)],
                    ["Evidence", String(hoveredCenter.evidenceCount)],
                    ["State", hoveredCenter.state],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[10px] font-mono">
                      <span className="text-white/30 uppercase">{k}</span>
                      <span className="text-white/70 font-bold">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-white/20 mt-2 font-mono">Click for full intelligence</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-8 px-5 py-2.5 border-t border-white/5 bg-black/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Compromised</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white/55 ring-1 ring-white/20" />
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Investigating</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Secure</span>
        </div>
      </div>

      <AnimatePresence>
        {selectedCenter && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="absolute right-0 top-0 bottom-0 w-72 bg-black/96 border-l border-white/10 flex flex-col z-40 backdrop-blur-xl"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/30 font-mono mb-0.5">
                  Center Intelligence
                </div>
                <h4 className="font-heading font-bold text-white text-lg tracking-wider">
                  {selectedCenter.centerCode}
                </h4>
              </div>
              <button
                onClick={() => setSelectedCenter(null)}
                className="p-1.5 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className={`flex items-center justify-between p-3 border ${
                selectedCenter.status === "compromised"
                  ? "border-white/20 bg-white/5"
                  : selectedCenter.status === "investigating"
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-white/5"
              }`}>
                <div className="flex items-center gap-2">
                  {selectedCenter.status === "compromised" ? (
                    <AlertTriangle className="w-4 h-4 text-white" />
                  ) : selectedCenter.status === "investigating" ? (
                    <Search className="w-4 h-4 text-white/60" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-white/40" />
                  )}
                  <span className={`text-xs font-bold uppercase tracking-widest ${
                    selectedCenter.status === "compromised"
                      ? "text-white"
                      : selectedCenter.status === "investigating"
                      ? "text-white/60"
                      : "text-white/30"
                  }`}>
                    {STATUS_CONFIG[selectedCenter.status].label}
                  </span>
                </div>
                <span className="text-xs font-mono text-white/30">Risk: {selectedCenter.risk}/100</span>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/20 font-mono mb-2">
                  Center Details
                </div>
                {[
                  ["Name", selectedCenter.name],
                  ["City", selectedCenter.city],
                  ["State", selectedCenter.state],
                  ["Code", selectedCenter.centerCode],
                  ["Lat/Lng", `${selectedCenter.lat.toFixed(3)}, ${selectedCenter.lng.toFixed(3)}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs py-1.5 border-b border-white/[0.04]">
                    <span className="text-white/25 font-mono uppercase tracking-wider text-[10px]">{label}</span>
                    <span className="text-white/60 text-right max-w-[150px] truncate">{value}</span>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/20 font-mono mb-2">
                  Threat Metrics
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] border border-white/5 p-3 text-center">
                    <div className="text-2xl font-bold font-heading text-white">
                      {selectedCenter.activeCases}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-white/25 font-mono mt-1">
                      Active Cases
                    </div>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 p-3 text-center">
                    <div className="text-2xl font-bold font-heading text-white">
                      {selectedCenter.evidenceCount}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-white/25 font-mono mt-1">
                      Evidence
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-white/25 mb-1.5">
                  <span className="uppercase tracking-widest">Risk Level</span>
                  <span className="text-white/50 font-bold">{selectedCenter.risk}%</span>
                </div>
                <div className="w-full h-1 bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedCenter.risk}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-white"
                    style={{
                      opacity: selectedCenter.risk >= 70 ? 1 : selectedCenter.risk >= 40 ? 0.6 : 0.3,
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes pulse-ring {
          0%   { r: 6; opacity: 0.5; }
          70%  { r: 14; opacity: 0; }
          100% { r: 14; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
