import { generateSeed, writeSeed } from './seed.js';
import {
  findByWatermark,
  findByPaperId,
  findByCenterCode,
  findCompromised,
  listAll,
  getStats,
  loadRegistry,
  clearCache,
} from './query.js';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = join(__dirname, '..', 'data', 'papers.json');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } catch (e: any) {
    failed++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  \u001b[31m✗\u001b[0m ${name}`);
    console.log(`      \u001b[31m${e.message}\u001b[0m`);
  }
}

function assert(cond: any, msg: string): void {
  if (!cond) throw new Error(msg);
}

function group(name: string): void {
  console.log(`\n\u001b[1m\u001b[36m  ${name}\u001b[0m`);
}

console.log('\u001b[1m\u001b[37m  EXAMSHIELD CORE — Test Suite\u001b[0m');
console.log('\u001b[2m  ─────────────────────────────\u001b[0m');

// ─────────────────────────── Seed Tests ───────────────────────────
group('Seed Generation');

test('generates at least 100 records', () => {
  const records = generateSeed();
  assert(records.length >= 100, `expected >= 100, got ${records.length}`);
});

test('records span all 5 exam types', () => {
  const records = generateSeed();
  const exams = new Set(records.map((r) => r.exam));
  ['NEET', 'JEE', 'UPSC', 'GATE', 'CBSE'].forEach((e) => {
    assert(exams.has(e as any), `missing exam: ${e}`);
  });
});

test('every watermark is unique', () => {
  const records = generateSeed();
  const ids = records.map((r) => r.watermarkId);
  assert(new Set(ids).size === ids.length, 'duplicate watermark IDs found');
});

test('every watermark follows WMK-XXX pattern', () => {
  const records = generateSeed();
  records.forEach((r) => {
    assert(/^WMK-\d{3}$/.test(r.watermarkId), `bad watermark: ${r.watermarkId}`);
  });
});

test('every record has chain of custody fields populated', () => {
  const records = generateSeed();
  records.forEach((r) => {
    assert(r.printBatch.length > 0, `${r.watermarkId} missing printBatch`);
    assert(r.printerId.length > 0, `${r.watermarkId} missing printerId`);
    assert(r.printedAt.length > 0, `${r.watermarkId} missing printedAt`);
    assert(r.distributedAt.length > 0, `${r.watermarkId} missing distributedAt`);
    assert(/^PB-\d+$/.test(r.printBatch), `${r.watermarkId} bad printBatch: ${r.printBatch}`);
    assert(/^PR-\d+$/.test(r.printerId), `${r.watermarkId} bad printerId: ${r.printerId}`);
  });
});

test('fingerprint is consistent (deterministic seed)', () => {
  const a = generateSeed();
  const b = generateSeed();
  const fa = a[0].questionFingerprint;
  const fb = b[0].questionFingerprint;
  assert(fa === fb, `fingerprints differ: ${fa} vs ${fb}`);
});

test('no actual question text is stored', () => {
  const records = generateSeed();
  records.forEach((r) => {
    assert(r.questionFingerprint.length === 8, `fingerprint not 8 chars: ${r.questionFingerprint}`);
    assert(!/question\s*\d/i.test(r.questionFingerprint), 'leaked question-like content');
  });
});

test('at least 5 records are pre-marked compromised for demo', () => {
  const records = generateSeed();
  const comp = records.filter((r) => r.status === 'compromised').length;
  assert(comp >= 5, `expected >= 5 compromised, got ${comp}`);
});

// ─────────────────────────── Write to disk ───────────────────────────
group('Disk Persistence');

// Re-seed before query tests so the data file exists
if (existsSync(DATA_PATH)) rmSync(DATA_PATH);
writeSeed();
clearCache();

test('papers.json exists after seed', () => {
  assert(existsSync(DATA_PATH), 'papers.json missing');
});

test('papers.json is valid JSON', () => {
  const records = loadRegistry();
  assert(Array.isArray(records), 'not an array');
  assert(records.length > 0, 'empty array');
});

// ─────────────────────────── Query Tests ───────────────────────────
group('Query Engine — findByWatermark');

test('finds a known watermark (case-insensitive)', () => {
  const r1 = findByWatermark('WMK-001');
  const r2 = findByWatermark('wmk-001');
  assert(r1.found, 'WMK-001 not found');
  assert(r2.found, 'lowercase wmk-001 not found');
  assert(r1.record?.watermarkId === r2.record?.watermarkId, 'case-insensitive mismatch');
});

test('returns chain of custody for known watermark', () => {
  const r = findByWatermark('WMK-001');
  assert(r.found && r.record, 'not found');
  assert(r.record!.paperId.length > 0, 'paperId missing');
  assert(r.record!.centerCode.length > 0, 'centerCode missing');
  assert(r.record!.centerName.length > 0, 'centerName missing');
  assert(r.record!.printBatch.length > 0, 'printBatch missing');
  assert(r.record!.printerId.length > 0, 'printerId missing');
  assert(r.record!.questionFingerprint.length > 0, 'fingerprint missing');
});

test('returns not-found for unknown watermark', () => {
  const r = findByWatermark('WMK-9999');
  assert(!r.found, 'should not find WMK-9999');
  assert(r.record === null, 'record should be null');
  assert(r.queryTime.length > 0, 'queryTime should be set');
});

test('trims whitespace before matching', () => {
  const r = findByWatermark('  WMK-001  ');
  assert(r.found, 'whitespace trim failed');
});

group('Query Engine — findByPaperId');

test('finds all centers for a paper', () => {
  const records = findByPaperId('NEET-2026-A');
  assert(records.length > 0, 'no centers for NEET-2026-A');
  records.forEach((r) => {
    assert(r.paperId === 'NEET-2026-A', `wrong paper: ${r.paperId}`);
  });
});

test('paper query is case-insensitive', () => {
  const records = findByPaperId('neet-2026-a');
  assert(records.length > 0, 'lowercase paper query failed');
});

group('Query Engine — findByCenterCode');

test('finds records for a center code', () => {
  const all = listAll().records;
  const someCode = all[0].centerCode;
  const matches = findByCenterCode(someCode);
  assert(matches.length >= 1, 'no match for known center');
  matches.forEach((r) => assert(r.centerCode === someCode, 'wrong center'));
});

group('Query Engine — findCompromised');

test('only returns compromised or investigating', () => {
  const rows = findCompromised();
  rows.forEach((r) => {
    assert(r.status === 'compromised' || r.status === 'investigating', `bad status: ${r.status}`);
  });
});

test('compromised list is non-empty (seed pre-marks some)', () => {
  const rows = findCompromised();
  assert(rows.length > 0, 'no compromised records');
});

group('Query Engine — listAll & getStats');

test('listAll returns records grouped by exam', () => {
  const { records, grouped } = listAll();
  assert(records.length > 0, 'no records');
  const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  assert(total === records.length, `grouped sum ${total} != records ${records.length}`);
});

test('getStats totals add up', () => {
  const s = getStats();
  const byExamSum = Object.values(s.byExam).reduce((a, b) => a + b, 0);
  const byStatusSum = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
  assert(byExamSum === s.total, `exam sum ${byExamSum} != total ${s.total}`);
  assert(byStatusSum === s.total, `status sum ${byStatusSum} != total ${s.total}`);
});

test('compromised percentage is computed correctly', () => {
  const s = getStats();
  const expected = ((s.byStatus.compromised + s.byStatus.investigating) / s.total) * 100;
  assert(Math.abs(expected - s.compromisedPercent) < 0.01, `expected ${expected}, got ${s.compromisedPercent}`);
});

// ─────────────────────────── Cache Tests ───────────────────────────
group('Cache Behavior');

test('cache returns same data without re-reading', () => {
  const a = loadRegistry();
  // corrupt the file behind the cache
  const original = a.length;
  writeFileSync(DATA_PATH, '[]');
  const b = loadRegistry();
  assert(b.length === original, 'cache should serve stale data');
  // restore
  writeSeed();
  clearCache();
  const c = loadRegistry();
  assert(c.length === original, 'after clearCache + reseed should match original');
});

// ─────────────────────────── Summary ───────────────────────────
console.log('\n\u001b[2m  ─────────────────────────────\u001b[0m');
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n\u001b[31m  Failures:\u001b[0m');
  failures.forEach((f) => console.log(`    • ${f}`));
  process.exit(1);
} else {
  console.log('\u001b[32m\n  ✓ All tests passed.\u001b[0m\n');
  process.exit(0);
}
