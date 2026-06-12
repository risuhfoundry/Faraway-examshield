"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceListResponse } from "@/lib/evidence-types";

export const EMPTY_EVIDENCE_STATE: EvidenceListResponse = {
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

const CACHE_KEY = "examshield-evidence-cache";
const DEFAULT_CACHE_TTL_MS = 60_000;

type CachedEvidence = {
  data: EvidenceListResponse;
  timestamp: number;
};

let memoryCache: CachedEvidence | null = null;
let inFlight: Promise<EvidenceListResponse> | null = null;

function now() {
  return Date.now();
}

function readStoredCache(): CachedEvidence | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEvidence;
    if (!parsed?.data || !parsed.timestamp) return null;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: EvidenceListResponse) {
  memoryCache = { data, timestamp: now() };
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
    window.dispatchEvent(new CustomEvent("examshield:evidence-cache"));
  } catch {
  }
}

export function getCachedEvidence(maxAgeMs = DEFAULT_CACHE_TTL_MS): EvidenceListResponse | null {
  const cached = memoryCache ?? readStoredCache();
  if (!cached) return null;
  return now() - cached.timestamp <= maxAgeMs ? cached.data : null;
}

export async function fetchEvidenceSnapshot(options?: { force?: boolean }) {
  if (!options?.force) {
    const cached = getCachedEvidence();
    if (cached) return cached;
  }

  if (inFlight) return inFlight;

  inFlight = fetch("/evidence", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Unable to load evidence.");
      }
      const payload = (await response.json()) as EvidenceListResponse;
      writeCache(payload);
      return payload;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useEvidenceFeed(options?: { intervalMs?: number; cacheTtlMs?: number }) {
  const intervalMs = options?.intervalMs ?? 5000;
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cached = getCachedEvidence(cacheTtlMs);
  const [data, setData] = useState<EvidenceListResponse>(cached ?? EMPTY_EVIDENCE_STATE);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(false);

  const refresh = useCallback(async (force = true) => {
    try {
      setRefreshing(force);
      const payload = await fetchEvidenceSnapshot({ force });
      if (mountedRef.current) {
        setData(payload);
      }
      return payload;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const cachedNow = getCachedEvidence(cacheTtlMs);
    if (cachedNow) {
      setData(cachedNow);
      setLoading(false);
    }

    refresh(true).catch(() => {
      if (mountedRef.current) setLoading(false);
    });

    const handleCacheUpdate = () => {
      const next = getCachedEvidence(cacheTtlMs);
      if (next && mountedRef.current) setData(next);
    };
    window.addEventListener("examshield:evidence-cache", handleCacheUpdate);

    const interval = intervalMs > 0
      ? window.setInterval(() => {
          refresh(true).catch(() => {});
        }, intervalMs)
      : null;

    return () => {
      mountedRef.current = false;
      window.removeEventListener("examshield:evidence-cache", handleCacheUpdate);
      if (interval) window.clearInterval(interval);
    };
  }, [cacheTtlMs, intervalMs, refresh]);

  return { data, loading, refreshing, refresh };
}
