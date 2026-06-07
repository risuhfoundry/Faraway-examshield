#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import {
  loadRegistry,
  findByWatermark,
  findByPaperId,
  findByCenterCode,
  findCompromised,
  listAll,
  getStats,
  getDataPath,
} from './lib/query.js';
import { writeSeed } from './lib/seed.js';
import type { PaperRecord, RiskLevel, PaperStatus } from './lib/schema.js';

const program = new Command();

const RISK_COLORS: Record<RiskLevel, (s: string) => string> = {
  low: chalk.green,
  medium: chalk.yellow,
  high: chalk.hex('#FFA500'),
  critical: chalk.red.bold,
};

const STATUS_COLORS: Record<PaperStatus, (s: string) => string> = {
  registered: chalk.white,
  in_transit: chalk.cyan,
  received: chalk.green,
  compromised: chalk.red.bold,
  investigating: chalk.yellow.bold,
};

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printChainOfCustody(r: PaperRecord, queryTime: string, watermark: string): void {
  const border = chalk.red('╔══════════════════════════════════════════════════════════════╗');
  const end = chalk.red('╚══════════════════════════════════════════════════════════════╝');
  const lines = [
    `  ${chalk.red.bold('CHAIN OF CUSTODY REPORT')}`,
    `  Query time: ${chalk.dim(queryTime)}`,
    ``,
    `  ${chalk.dim('WATERMARK')}    ${chalk.white.bold(r.watermarkId)}  (queried: ${watermark})`,
    `  ${chalk.dim('PAPER')}        ${chalk.white.bold(r.paperId)}`,
    `  ${chalk.dim('EXAM')}         ${chalk.white(r.exam)} ${chalk.dim(r.year)}  Set ${r.paperSet}`,
    ``,
    `  ${chalk.dim('CENTER')}       ${chalk.white.bold(r.centerCode)}`,
    `  ${chalk.dim('NAME')}         ${chalk.white(r.centerName)}`,
    `  ${chalk.dim('LOCATION')}     ${chalk.white(r.city + ', ' + r.state)}`,
    ``,
    `  ${chalk.dim('PRINT BATCH')}  ${chalk.white(r.printBatch)}`,
    `  ${chalk.dim('PRINTER ID')}   ${chalk.white(r.printerId)}`,
    `  ${chalk.dim('PRINTED')}      ${chalk.white(r.printedAt)}`,
    `  ${chalk.dim('DISTRIBUTED')}  ${chalk.white(r.distributedAt)}`,
    ``,
    `  ${chalk.dim('RISK')}         ${RISK_COLORS[r.riskLevel](r.riskLevel.toUpperCase())}`,
    `  ${chalk.dim('STATUS')}       ${STATUS_COLORS[r.status](r.status.toUpperCase())}`,
    ``,
    `  ${chalk.dim('FINGERPRINT')}  ${chalk.magenta(r.questionFingerprint)}`,
  ];
  const mid = (line: string) => chalk.red('║') + line + ' '.repeat(Math.max(0, 63 - line.replace(/\u001b\[[0-9;]*m/g, '').length)) + chalk.red('║');

  console.log(border);
  for (const l of lines) {
    console.log(mid(l));
  }
  console.log(end);
}

function printNotFound(watermark: string, queryTime: string): void {
  const border = chalk.green('╔══════════════════════════════════════════════════════════════╗');
  const end = chalk.green('╚══════════════════════════════════════════════════════════════╝');
  const lines = [
    `  ${chalk.green.bold('NO MATCH')}  ${chalk.dim('Registry is clean.')}`,
    `  ${chalk.dim('Watermark')}   ${chalk.white(watermark)}`,
    `  ${chalk.dim('Query time')}  ${chalk.dim(queryTime)}`,
  ];
  const mid = (line: string) => chalk.green('║') + line + ' '.repeat(Math.max(0, 63 - line.replace(/\u001b\[[0-9;]*m/g, '').length)) + chalk.green('║');
  console.log(border);
  for (const l of lines) console.log(mid(l));
  console.log(end);
}

program
  .name('examshield-core')
  .description('EXAMSHIELD Paper Registry — chain of custody data layer')
  .version('1.0.0');

program
  .command('seed')
  .description('Generate the seed JSON file with 100+ paper records')
  .action(() => {
    const { count, path } = writeSeed();
    console.log(chalk.green(`✓ Seeded ${count} records → ${path}`));
  });

program
  .command('query <watermark>')
  .description('Query a watermark and display its chain of custody')
  .action((watermark: string) => {
    const result = findByWatermark(watermark);
    if (result.found && result.record) {
      printChainOfCustody(result.record, result.queryTime, watermark);
    } else {
      printNotFound(watermark, result.queryTime);
      process.exit(1);
    }
  });

program
  .command('lookup <value>')
  .description('Auto-detect type of value (watermark / paperId / centerCode) and look up')
  .action((value: string) => {
    const v = value.trim();
    if (/^WMK-?\d+$/i.test(v)) {
      const result = findByWatermark(v);
      if (result.found && result.record) printChainOfCustody(result.record, result.queryTime, v);
      else { printNotFound(v, result.queryTime); process.exit(1); }
    } else if (/^[A-Z]{2,4}-\d+$/i.test(v)) {
      const matches = findByCenterCode(v);
      if (matches.length === 0) { console.log(chalk.yellow('No records for center ' + v)); process.exit(1); }
      console.log(chalk.white.bold(`\n  Center ${v} — ${matches.length} record(s)\n`));
      for (const r of matches) {
        const color = r.status === 'compromised' ? chalk.red : r.status === 'investigating' ? chalk.yellow : chalk.white;
        console.log(color(`  [${r.watermarkId}] ${r.paperId}  ${r.centerName}  status=${r.status}`));
      }
    } else {
      const matches = findByPaperId(v);
      if (matches.length === 0) { console.log(chalk.yellow('No records for paper ' + v)); process.exit(1); }
      console.log(chalk.white.bold(`\n  Paper ${v} — ${matches.length} record(s)\n`));
      for (const r of matches) {
        const color = r.status === 'compromised' ? chalk.red : r.status === 'investigating' ? chalk.yellow : chalk.white;
        console.log(color(`  [${r.watermarkId}] center=${r.centerCode} status=${r.status} risk=${r.riskLevel}`));
      }
    }
  });

program
  .command('watch')
  .description('Interactive watch mode — paste watermarks to look up')
  .action(async () => {
    console.log(chalk.cyan.bold('\n  EXAMSHIELD · Registry Watch Mode'));
    console.log(chalk.dim('  Paste a watermark ID to look up. Type `exit` to quit.\n'));
    loadRegistry();
    console.log(chalk.dim(`  Loaded ${loadRegistry().length} records from ${getDataPath()}\n`));

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const prompt = (): void => {
      rl.question(chalk.cyan('  examshield> '), (input) => {
        const v = input.trim();
        if (!v) return prompt();
        if (v === 'exit' || v === 'quit' || v === 'q') {
          console.log(chalk.dim('  Bye.'));
          rl.close();
          return;
        }
        if (v === 'clear' || v === 'cls') {
          console.clear();
          return prompt();
        }
        const result = findByWatermark(v);
        if (result.found && result.record) {
          printChainOfCustody(result.record, result.queryTime, v);
        } else {
          printNotFound(v, result.queryTime);
        }
        console.log();
        prompt();
      });
    };
    prompt();
  });

program
  .command('list')
  .description('List all papers grouped by exam')
  .option('-e, --exam <exam>', 'Filter by exam (NEET, JEE, UPSC, GATE, CBSE)')
  .option('-l, --limit <n>', 'Limit rows per exam')
  .action((opts) => {
    const { grouped } = listAll();
    const exams: Array<keyof typeof grouped> = opts.exam
      ? [opts.exam.toUpperCase() as keyof typeof grouped]
      : ['NEET', 'JEE', 'UPSC', 'GATE', 'CBSE'];
    const limit = opts.limit ? parseInt(opts.limit, 10) : 5;

    for (const exam of exams) {
      const rows = grouped[exam] || [];
      if (rows.length === 0) continue;
      console.log(chalk.white.bold(`\n  ${exam} 2026  (${rows.length} records)`));
      console.log(chalk.dim('  ' + '─'.repeat(70)));
      console.log('  ' + chalk.dim(pad('WATERMARK', 11) + pad('PAPER', 14) + pad('CENTER', 10) + pad('RISK', 10) + 'STATUS'));
      console.log(chalk.dim('  ' + '─'.repeat(70)));
      for (const r of rows.slice(0, limit)) {
        const row = '  ' + pad(r.watermarkId, 11) + pad(r.paperId, 14) + pad(r.centerCode, 10) + pad(r.riskLevel, 10) + r.status;
        console.log(STATUS_COLORS[r.status](row));
      }
      if (rows.length > limit) console.log(chalk.dim(`  ... +${rows.length - limit} more (use --limit to see all)`));
    }
    console.log();
  });

program
  .command('compromised')
  .description('Show only compromised and investigating records')
  .action(() => {
    const rows = findCompromised();
    if (rows.length === 0) {
      console.log(chalk.green('\n  ✓ No compromised records.\n'));
      return;
    }
    console.log(chalk.red.bold(`\n  ${rows.length} COMPROMISED / INVESTIGATING RECORDS\n`));
    console.log(chalk.dim('  ' + '─'.repeat(70)));
    console.log('  ' + chalk.dim(pad('WATERMARK', 11) + pad('PAPER', 14) + pad('CENTER', 10) + 'STATUS'));
    console.log(chalk.dim('  ' + '─'.repeat(70)));
    for (const r of rows) {
      const row = '  ' + pad(r.watermarkId, 11) + pad(r.paperId, 14) + pad(r.centerCode, 10) + r.status;
      console.log(STATUS_COLORS[r.status](row));
    }
    console.log();
  });

program
  .command('stats')
  .description('Registry summary statistics')
  .action(() => {
    const s = getStats();
    console.log(chalk.white.bold('\n  EXAMSHIELD · Registry Stats\n'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    console.log(`  ${chalk.dim('Total records:')}     ${chalk.white.bold(s.total)}`);
    console.log(`  ${chalk.dim('Compromised:')}       ${chalk.red.bold(s.byStatus.compromised)}  ${chalk.dim('(' + s.compromisedPercent.toFixed(1) + '%)')}`);
    console.log(`  ${chalk.dim('Investigating:')}     ${chalk.yellow.bold(s.byStatus.investigating)}`);
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    console.log(chalk.white.bold('\n  By Exam'));
    for (const [exam, count] of Object.entries(s.byExam)) {
      console.log(`    ${chalk.dim(pad(exam, 8))} ${chalk.white(count)}`);
    }
    console.log(chalk.white.bold('\n  By Status'));
    for (const [status, count] of Object.entries(s.byStatus)) {
      console.log(`    ${STATUS_COLORS[status as PaperStatus](pad(status, 16))} ${chalk.white(count)}`);
    }
    console.log(chalk.white.bold('\n  By Risk'));
    for (const [risk, count] of Object.entries(s.byRiskLevel)) {
      console.log(`    ${RISK_COLORS[risk as RiskLevel](pad(risk, 10))} ${chalk.white(count)}`);
    }
    console.log();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
