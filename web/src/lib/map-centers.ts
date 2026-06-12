import type { EvidenceListResponse } from "@/lib/evidence-types";

export type ThreatMapCenter = {
  id: string;
  centerCode: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  status: "secure" | "investigating" | "compromised";
  risk: number;
  activeCases: number;
  evidenceCount: number;
};

type CenterGeo = {
  id?: string;
  centerCode: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
};

type CenterAccumulator = {
  centerCode: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  evidenceIds: Set<string>;
  openAlerts: number;
  maxRisk: number;
  hasCompromised: boolean;
  hasInvestigating: boolean;
};

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "new delhi": { lat: 28.6139, lng: 77.209 },
  delhi: { lat: 28.6139, lng: 77.209 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  chandigarh: { lat: 30.7333, lng: 76.7794 },
  gurugram: { lat: 28.4595, lng: 77.0266 },
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function riskFromLevel(level: string | null | undefined, fallback = 0) {
  const normalized = normalize(level);
  if (normalized === "critical" || normalized === "compromised") return Math.max(fallback, 90);
  if (normalized === "high" || normalized === "investigating") return Math.max(fallback, 65);
  if (normalized === "medium") return Math.max(fallback, 45);
  if (normalized === "low" || normalized === "registered" || normalized === "received") {
    return Math.max(fallback, 20);
  }
  return fallback;
}

function resolveGeo(
  centerCode: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  centerName: string | null | undefined,
  lookup: Map<string, CenterGeo>,
): CenterGeo | null {
  const code = String(centerCode || "").trim();
  if (code && lookup.has(code)) {
    return lookup.get(code)!;
  }

  const cityKey = normalize(city);
  const coords = CITY_COORDS[cityKey];
  if (!coords) {
    return null;
  }

  return {
    centerCode: code || cityKey.toUpperCase().slice(0, 3),
    name: centerName || city || code || "Unknown Center",
    city: city || "Unknown",
    state: state || "Unknown",
    lat: coords.lat,
    lng: coords.lng,
  };
}

function upsertCenter(
  map: Map<string, CenterAccumulator>,
  geo: CenterGeo,
  patch: Partial<Pick<CenterAccumulator, "openAlerts" | "maxRisk" | "hasCompromised" | "hasInvestigating">> & {
    evidenceId?: string | null;
  },
) {
  const key = geo.centerCode;
  const existing = map.get(key) ?? {
    centerCode: geo.centerCode,
    name: geo.name,
    city: geo.city,
    state: geo.state,
    lat: geo.lat,
    lng: geo.lng,
    evidenceIds: new Set<string>(),
    openAlerts: 0,
    maxRisk: 0,
    hasCompromised: false,
    hasInvestigating: false,
  };

  if (patch.evidenceId) {
    existing.evidenceIds.add(patch.evidenceId);
  }
  if (patch.openAlerts) {
    existing.openAlerts += patch.openAlerts;
  }
  if (patch.maxRisk !== undefined) {
    existing.maxRisk = Math.max(existing.maxRisk, patch.maxRisk);
  }
  if (patch.hasCompromised) {
    existing.hasCompromised = true;
  }
  if (patch.hasInvestigating) {
    existing.hasInvestigating = true;
  }

  map.set(key, existing);
}

export function buildThreatMapCenters(
  data: EvidenceListResponse,
  geoLookup: CenterGeo[],
): ThreatMapCenter[] {
  const lookup = new Map<string, CenterGeo>();
  for (const center of geoLookup) {
    lookup.set(center.centerCode, center);
  }

  const grouped = new Map<string, CenterAccumulator>();

  for (const report of data.forensicReports) {
    const geo = resolveGeo(
      report.centerCode,
      report.city,
      report.state,
      report.centerName,
      lookup,
    );
    if (!geo || !report.evidenceId) continue;

    const risk = Math.max(
      report.finalConfidence ?? 0,
      riskFromLevel(report.riskLevel, 0),
    );
    upsertCenter(grouped, geo, {
      evidenceId: report.evidenceId,
      maxRisk: risk,
      hasCompromised:
        report.riskLevel === "critical" ||
        report.status === "investigation-complete" && report.finalConfidence > 80,
      hasInvestigating: report.status === "no-match" || report.riskLevel === "investigating",
    });
  }

  for (const attribution of data.attributions) {
    const geo = resolveGeo(
      attribution.centerCode,
      attribution.city,
      attribution.state,
      attribution.centerName,
      lookup,
    );
    if (!geo || !attribution.evidenceId) continue;

    upsertCenter(grouped, geo, {
      evidenceId: attribution.evidenceId,
      maxRisk: Math.max(attribution.finalConfidence ?? 0, riskFromLevel(attribution.status, 0)),
      hasCompromised: attribution.status === "compromised",
      hasInvestigating: attribution.status === "investigating",
    });
  }

  for (const alert of data.alerts) {
    const report = data.forensicReports.find((item) => item.evidenceId === alert.evidenceId);
    const attribution = data.attributions.find((item) => item.evidenceId === alert.evidenceId);
    const geo = resolveGeo(
      alert.centerCode ?? report?.centerCode ?? attribution?.centerCode,
      report?.city ?? attribution?.city,
      report?.state ?? attribution?.state,
      report?.centerName ?? attribution?.centerName,
      lookup,
    );
    if (!geo) continue;

    upsertCenter(grouped, geo, {
      evidenceId: alert.evidenceId,
      openAlerts: alert.status === "open" ? 1 : 0,
      maxRisk: Math.max(
        alert.confidence ?? 0,
        alert.detectionScore && alert.detectionMaxScore
          ? Math.round((alert.detectionScore / alert.detectionMaxScore) * 100)
          : 0,
        riskFromLevel(alert.risk, 0),
      ),
      hasCompromised: alert.risk === "critical",
      hasInvestigating: alert.risk === "high" || alert.risk === "medium",
    });
  }

  // Text-only detections without center attribution still surface via detection alerts.
  for (const item of data.evidence) {
    if (item.fileType !== "text/plain" || item.detectionScore === null) continue;
    const linkedAlert = data.alerts.find((alert) => alert.evidenceId === item.evidenceId);
    if (!linkedAlert?.centerCode) continue;
    const geo = resolveGeo(linkedAlert.centerCode, null, null, null, lookup);
    if (!geo) continue;
    upsertCenter(grouped, geo, {
      evidenceId: item.evidenceId,
      maxRisk: item.detectionMaxScore
        ? Math.round((item.detectionScore / item.detectionMaxScore) * 100)
        : item.detectionScore,
      hasInvestigating: true,
    });
  }

  return Array.from(grouped.values())
    .map((center) => ({
      id: center.centerCode,
      centerCode: center.centerCode,
      name: center.name,
      city: center.city,
      state: center.state,
      lat: center.lat,
      lng: center.lng,
      status: center.hasCompromised
        ? "compromised"
        : center.hasInvestigating || center.openAlerts > 0
          ? "investigating"
          : "secure",
      risk: center.maxRisk,
      activeCases: center.openAlerts,
      evidenceCount: center.evidenceIds.size,
    }))
    .sort((a, b) => b.risk - a.risk || b.evidenceCount - a.evidenceCount);
}
