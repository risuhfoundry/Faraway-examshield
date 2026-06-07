import {
  findRegistryRecordByWatermark,
  formatMatchedExam,
  normalizeWatermarkId,
  type PaperRegistryRecord,
} from "./paper-matcher";

export type WatermarkExtractionResult =
  | {
      status: "detected";
      watermarkId: string;
      confidence: number;
      registryRecord: PaperRegistryRecord;
    }
  | {
      status: "invalid";
      watermarkId: string;
      confidence: number;
      registryRecord: null;
    }
  | {
      status: "not-detected";
      watermarkId: null;
      confidence: 0;
      registryRecord: null;
    };

export function extractWatermarkFromText(text: string): WatermarkExtractionResult {
  const candidates = extractWatermarkCandidates(text);

  if (candidates.length === 0) {
    return {
      status: "not-detected",
      watermarkId: null,
      confidence: 0,
      registryRecord: null,
    };
  }

  const watermarkId = candidates[0];
  const registryRecord = findRegistryRecordByWatermark(watermarkId);

  if (!registryRecord) {
    return {
      status: "invalid",
      watermarkId,
      confidence: 70,
      registryRecord: null,
    };
  }

  return {
    status: "detected",
    watermarkId,
    confidence: 100,
    registryRecord,
  };
}

export function describeWatermarkMatch(result: WatermarkExtractionResult) {
  if (result.status !== "detected") {
    return "No validated watermark found";
  }

  return `${result.watermarkId} -> ${formatMatchedExam(result.registryRecord)} / ${result.registryRecord.centerCode}`;
}

function extractWatermarkCandidates(text: string) {
  const matches = text.match(/WMK[-\s]?\d{1,4}/gi) ?? [];
  const normalized = matches.map(normalizeWatermarkId);
  return Array.from(new Set(normalized));
}
