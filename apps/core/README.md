# EXAMSHIELD · Core

The **Paper Registry** — the foundational data layer of EXAMSHIELD. Every other component (OCR, Telegram bots, AI workers) will query this registry to identify leaked papers.

> If the registry is wrong, everything downstream is wrong.
> If the registry is right, everything downstream can be built with confidence.

## What it stores

For every paper printed and distributed, the registry holds the **full chain of custody**:

```ts
{
  watermarkId: "WMK-005",
  paperId: "NEET-2026-A",
  exam: "NEET", year: 2026, paperSet: "A",
  questionFingerprint: "3efe2028",      // sha256 truncated, never raw questions

  centerCode: "KOL-05",
  centerName: "La Martiniere for Boys",
  city: "Kolkata", state: "West Bengal",

  printBatch: "PB-01",
  printerId: "PR-05",
  printedAt: "2026-04-11T00:00:00.000Z",
  distributedAt: "2026-05-06T00:00:00.000Z",

  riskLevel: "critical",                 // low | medium | high | critical
  status: "compromised"                  // registered | in_transit | received | compromised | investigating
}
```

## CLI

```bash
npm install
npm run seed          # generate 110 records → data/papers.json

npm run query WMK-001     # full chain of custody report
npm run lookup NEET-2026-A # by paper id
npm run lookup DEL-01      # by center code
npm run compromised        # only flagged records
npm run list               # all records grouped by exam
npm run stats              # registry summary
npm run watch              # interactive listener mode
```

### Example output

```
╔══════════════════════════════════════════════════════════════╗
║  CHAIN OF CUSTODY REPORT                                     ║
║  Query time: 0.25ms                                          ║
║                                                              ║
║  WATERMARK    WMK-005                                        ║
║  PAPER        NEET-2026-A                                    ║
║  EXAM         NEET 2026  Set A                               ║
║                                                              ║
║  CENTER       KOL-05                                         ║
║  NAME         La Martiniere for Boys                         ║
║  LOCATION     Kolkata, West Bengal                           ║
║                                                              ║
║  PRINT BATCH  PB-01                                          ║
║  PRINTER ID   PR-05                                          ║
║  PRINTED      2026-04-11T00:00:00.000Z                       ║
║  DISTRIBUTED  2026-05-06T00:00:00.000Z                       ║
║                                                              ║
║  RISK         CRITICAL                                       ║
║  STATUS       COMPROMISED                                    ║
║  FINGERPRINT  3efe2028                                       ║
╚══════════════════════════════════════════════════════════════╝
```

## Tests

```bash
npm test
```

23 tests covering: seed generation, disk persistence, query engine, cache behavior.

```
23 passed, 0 failed
```

## Integration (later)

The query engine exports pure functions — no I/O at the call site:

```ts
import { findByWatermark, findByPaperId, findCompromised, getStats } from 'examshield-core/lib/query';

// In /apps/api:
const result = findByWatermark('WMK-005');
if (result.found) await alertOperator(result.record);
```

When the API or AI workers need a real database, only `query.ts` needs to be swapped — every other module imports from it.

## Design Decisions

1. **JSON, not Postgres** — Week 1 doesn't need a DB. 110 records fit comfortably in memory. Swap to Postgres + Prisma later.
2. **No actual question text** — only a fingerprint. In a real system the questions are the most sensitive asset.
3. **Chain of custody over flat lookup** — when a leak happens, the response must show the *trail* (printer, batch, distribution time) not just the paper id.
4. **Some records pre-flagged compromised** — so the dashboard demo is not empty on day one.
