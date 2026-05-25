#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultOutDir = 'nutrition-audits/llm-rater/latest';
const twoLevelDir = 'nutrition-audits/two-level/latest';
const defaultTimeoutMs = 10 * 60 * 1000;

const copyRequirement = 'Calories and sodium are estimates and must be described as varying by brand, portion, ingredient form, and cooking method.';
const highImpactIngredientIds = new Set([
  'light-soy',
  'oyster-sauce',
  'miso',
  'gochujang',
  'curry-block',
  'curry-paste',
  'chicken-broth',
  'beef-noodle-broth',
  'black-bean-sauce',
  'hoisin-sauce',
  'satay-sauce',
  'teriyaki-sauce',
  'luncheon-meat',
  'fish-ball',
  'kimchi',
  'lu-rou-sauce',
  'lu-wei-mix',
  'three-cup-sauce',
  'shaoxing-wine',
  'rice',
  'cooked-rice',
  'dried-noodle',
  'udon',
  'soba',
  'rice-noodle',
  'ho-fun',
  'macaroni',
  'bread',
  'wonton-wrapper',
  'pancake-mix',
  'tteok',
  'rice-paper',
  'egg',
  'chicken-thigh',
  'chicken-wing',
  'pork-mince',
  'pork-chop',
  'beef-slice',
  'beef-brisket',
  'spare-ribs',
  'salmon-fillet',
  'shrimp',
  'white-fish-fillet',
  'tofu',
  'soft-tofu',
  'coconut-milk',
  'peanut'
]);

export const raterOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'verdict',
    'hardFails',
    'warnings',
    'ingredientLevel',
    'mealLevel',
    'copyCheck',
    'humanReviewReason'
  ],
  properties: {
    verdict: { type: 'string', enum: ['good', 'warning', 'fail'] },
    hardFails: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    ingredientLevel: {
      type: 'object',
      additionalProperties: true,
      required: ['summary', 'sampledRows', 'sourceCheckNotes'],
      properties: {
        summary: { type: 'string' },
        sampledRows: { type: 'array', items: { type: 'object', additionalProperties: true } },
        sourceCheckNotes: { type: 'array', items: { type: 'string' } }
      }
    },
    mealLevel: {
      type: 'object',
      additionalProperties: true,
      required: ['summary', 'recomputationConcerns', 'sodiumLevelConcerns'],
      properties: {
        summary: { type: 'string' },
        recomputationConcerns: { type: 'array', items: { type: 'string' } },
        sodiumLevelConcerns: { type: 'array', items: { type: 'string' } }
      }
    },
    copyCheck: {
      type: 'object',
      additionalProperties: true,
      required: ['estimatesDisclosed', 'notes'],
      properties: {
        estimatesDisclosed: { type: 'boolean' },
        notes: { type: 'string' }
      }
    },
    humanReviewReason: { type: 'string' }
  }
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function parseArgs(argv) {
  const args = {
    outDir: undefined,
    timeoutMs: defaultTimeoutMs,
    write: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (arg === '--no-write') {
      args.write = false;
    } else {
      throw new Error('Unknown option: ' + arg);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive integer.');
  }
  return args;
}

function issueRows(report) {
  return (report?.rows ?? []).filter((row) => row.status === 'fail' || row.status === 'warning');
}

function highImpactRows(report) {
  return (report?.rows ?? []).filter((row) => {
    if (highImpactIngredientIds.has(row.id)) return true;
    if (row.status === 'fail' || row.status === 'warning') return true;
    const haystack = [row.id, row.name, ...(row.issues ?? []).map((issue) => issue.code)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return ['sodium', 'calorie', 'kcal', 'sauce', 'broth', 'oil', 'salt'].some((token) => haystack.includes(token));
  });
}

export function buildRaterPacket({ ingredientReport, mealReport, twoLevelSummary, deterministicGate = null }) {
  return {
    schemaVersion: 'llm-nutrition-rater-packet-v1',
    generatedAt: new Date().toISOString(),
    sourceArtifacts: {
      ingredientAudit: 'nutrition-audits/two-level/latest/ingredient-nutrition-audit.json',
      mealAudit: 'nutrition-audits/two-level/latest/meal-nutrition-audit.json',
      twoLevelSummary: 'nutrition-audits/two-level/latest/two-level-summary.json'
    },
    tolerance: twoLevelSummary?.tolerance ?? { relative: 0.1 },
    copyRequirement: twoLevelSummary?.copyRequirement ?? copyRequirement,
    deterministicGate,
    ingredientLevel: {
      summary: ingredientReport?.summary ?? null,
      issueRows: issueRows(ingredientReport),
      highImpactRows: highImpactRows(ingredientReport),
      report: ingredientReport
    },
    mealLevel: {
      summary: mealReport?.summary ?? null,
      issueRows: issueRows(mealReport),
      topCaloriesMeals: mealReport?.topCaloriesMeals ?? [],
      topSodiumMeals: mealReport?.topSodiumMeals ?? [],
      report: mealReport
    }
  };
}

function parseDeterministicGateOutput(commandResult) {
  const text = [commandResult.stdout, commandResult.stderr].filter(Boolean).join('\n');
  const statusMatch = text.match(/Nutrition deterministic audit:\s*([A-Z_]+)/);
  const rowsMatch = text.match(/Rows audited:\s*(\d+)/);
  const sourceMatch = text.match(/Source-match pass rate:\s*([0-9.]+)%/);
  const highSeverityMatch = text.match(/High-severity issues:\s*(\d+)/);
  const coverageMatch = text.match(/High-impact coverage:\s*([0-9.]+)%/);
  const blockedReasons = [];
  const lines = text.split(/\r?\n/);
  const blockedIndex = lines.findIndex((line) => line.trim() === 'Blocked reasons:');
  if (blockedIndex !== -1) {
    for (const line of lines.slice(blockedIndex + 1)) {
      if (!line.trim().startsWith('- ')) break;
      blockedReasons.push(line.trim().slice(2));
    }
  }

  return {
    command: 'npm run nutrition:gate -- --no-write',
    exitCode: commandResult.status ?? null,
    status: statusMatch?.[1]?.toLowerCase() ?? (commandResult.status === 0 ? 'passed' : 'unknown'),
    rowsAudited: rowsMatch ? Number.parseInt(rowsMatch[1], 10) : null,
    sourceMatchPassRate: sourceMatch ? Number.parseFloat(sourceMatch[1]) / 100 : null,
    highSeverityIssues: highSeverityMatch ? Number.parseInt(highSeverityMatch[1], 10) : null,
    highImpactCoverage: coverageMatch ? Number.parseFloat(coverageMatch[1]) / 100 : null,
    blockedReasons,
    output: text.trim()
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    error: result.error ?? null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function extractJsonCandidate(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with common LLM output wrappers.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Fall through to brace extraction.
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function validateStringArray(value, field, errors) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    errors.push(field + ' must be an array of strings.');
  }
}

function validateObject(value, field, errors) {
  if (!isObject(value)) errors.push(field + ' must be an object.');
}

function validateRaterResult(value) {
  const errors = [];
  if (!isObject(value)) {
    return ['Rater output must be a JSON object.'];
  }
  if (!['good', 'warning', 'fail'].includes(value.verdict)) {
    errors.push('verdict must be one of good, warning, or fail.');
  }
  validateStringArray(value.hardFails, 'hardFails', errors);
  validateStringArray(value.warnings, 'warnings', errors);
  validateObject(value.ingredientLevel, 'ingredientLevel', errors);
  validateObject(value.mealLevel, 'mealLevel', errors);
  validateObject(value.copyCheck, 'copyCheck', errors);
  if (isObject(value.copyCheck)) {
    if (typeof value.copyCheck.estimatesDisclosed !== 'boolean') {
      errors.push('copyCheck.estimatesDisclosed must be boolean.');
    }
    if (typeof value.copyCheck.notes !== 'string') {
      errors.push('copyCheck.notes must be a string.');
    }
  }
  if (typeof value.humanReviewReason !== 'string') {
    errors.push('humanReviewReason must be a string.');
  }
  if (value.verdict === 'fail' && !value.humanReviewReason?.trim()) {
    errors.push('humanReviewReason is required when verdict is fail.');
  }
  return errors;
}

function coerceRaterResult(parsed) {
  if (!isObject(parsed)) return { value: parsed, schemaErrors: validateRaterResult(parsed) };

  const directErrors = validateRaterResult(parsed);
  if (directErrors.length === 0) return { value: parsed, schemaErrors: [] };

  if ('result' in parsed) {
    const nested = typeof parsed.result === 'string' ? extractJsonCandidate(parsed.result) : parsed.result;
    const nestedErrors = validateRaterResult(nested);
    if (nestedErrors.length === 0) return { value: nested, schemaErrors: [] };
    return { value: nested ?? parsed, schemaErrors: nestedErrors };
  }

  return { value: parsed, schemaErrors: directErrors };
}

export function normalizeRaterOutput({ rater, rawText, exitCode, timedOut, stderr = '', signal = null }) {
  const base = {
    rater,
    receivedAt: new Date().toISOString(),
    status: 'completed',
    exitCode: exitCode ?? null,
    signal,
    result: null,
    error: null
  };

  if (timedOut) {
    return {
      ...base,
      status: 'timeout',
      error: { message: rater + ' timed out before returning a valid rating.', stderr }
    };
  }
  if (exitCode !== 0) {
    return {
      ...base,
      status: 'cli_error',
      error: { message: rater + ' exited with code ' + exitCode + '.', stderr }
    };
  }

  const parsed = extractJsonCandidate(rawText);
  if (!parsed) {
    return {
      ...base,
      status: 'invalid_json',
      error: { message: rater + ' did not return parseable JSON.', stderr }
    };
  }

  const { value, schemaErrors } = coerceRaterResult(parsed);
  if (schemaErrors.length > 0) {
    return {
      ...base,
      status: 'schema_invalid',
      result: isObject(value) ? value : null,
      error: { message: rater + ' JSON did not match the rater schema.', schemaErrors, stderr }
    };
  }

  return { ...base, result: value };
}

function completedWarnings(run) {
  if (run?.status !== 'completed') return [];
  return (run.result?.warnings ?? []).map((message) => ({ rater: run.rater, message }));
}

export function aggregateRaterRuns({ codex, claude }) {
  const runs = [codex, claude];
  const decisionReasons = [];
  const humanReviewReasons = [];

  for (const run of runs) {
    if (!run || run.status !== 'completed') {
      decisionReasons.push((run?.rater ?? 'unknown') + ' did not return valid rater JSON (' + (run?.status ?? 'missing') + ').');
      if (run?.error?.message) humanReviewReasons.push(run.rater + ': ' + run.error.message);
      continue;
    }
    if (run.result.verdict === 'fail') {
      decisionReasons.push(run.rater + ' reported fail.');
      if (run.result.humanReviewReason) humanReviewReasons.push(run.rater + ': ' + run.result.humanReviewReason);
    }
    if (run.result.hardFails.length > 0) {
      decisionReasons.push(run.rater + ' reported hard fails.');
      for (const hardFail of run.result.hardFails) humanReviewReasons.push(run.rater + ': ' + hardFail);
    }
  }

  return {
    schemaVersion: 'llm-nutrition-rater-summary-v1',
    generatedAt: new Date().toISOString(),
    finalVerdict: decisionReasons.length === 0 ? 'pass' : 'human_review',
    decisionRule: 'Pass only when Codex and Claude return valid JSON and neither rater reports verdict=fail or hardFails.',
    decisionReasons,
    humanReviewReasons,
    warnings: runs.flatMap(completedWarnings),
    raters: {
      codex: summarizeRun(codex),
      claude: summarizeRun(claude)
    }
  };
}

function summarizeRun(run) {
  if (!run) return { status: 'missing', verdict: null, hardFailCount: 0, warningCount: 0 };
  return {
    status: run.status,
    verdict: run.result?.verdict ?? null,
    hardFailCount: run.result?.hardFails?.length ?? 0,
    warningCount: run.result?.warnings?.length ?? 0,
    error: run.error?.message ?? null
  };
}

export function buildRaterPrompt({ packetPath, raterName }) {
  return [
    'You are ' + raterName + ', an independent LLM nutrition data rater.',
    '',
    'Work read-only. Do not edit dataset files.',
    'Review this packet: ' + packetPath,
    '',
    'Goal:',
    'Judge whether the calories and sodium verification performance is acceptable at two levels: ingredient source verification and meal recomputation.',
    '',
    'Rules:',
    '- Use +/-10% as the kcal and sodium legitimacy tolerance.',
    '- Treat nutrition values as planning estimates, not exact facts.',
    '- Use source search only for suspicious, high-impact, or unclear rows.',
    '- Return fail for missing sources, unsupported units, uncomputable approved meals, unverified sodium drivers, or user-facing wording that presents estimates as exact facts.',
    '- Warnings are allowed only for non-blocking concerns.',
    '',
    'Return only JSON matching this schema:',
    JSON.stringify(raterOutputSchema, null, 2)
  ].join('\n');
}

function loadTwoLevelArtifacts(root) {
  const dir = path.join(root, twoLevelDir);
  return {
    ingredientReport: readJson(path.join(dir, 'ingredient-nutrition-audit.json')),
    mealReport: readJson(path.join(dir, 'meal-nutrition-audit.json')),
    twoLevelSummary: readJson(path.join(dir, 'two-level-summary.json'))
  };
}

function writeRawResult(outDir, rater, commandResult, outputText) {
  writeFileSync(path.join(outDir, rater + '-stdout.txt'), commandResult.stdout ?? '');
  writeFileSync(path.join(outDir, rater + '-stderr.txt'), commandResult.stderr ?? '');
  writeFileSync(path.join(outDir, rater + '-raw.txt'), outputText ?? '');
}

function runCodexRater({ root, outDir, schemaPath, prompt, timeoutMs }) {
  const outputPath = path.join(outDir, 'codex-rater.raw.txt');
  const args = [
    '--search',
    '--ask-for-approval',
    'never',
    'exec',
    '--cd',
    root,
    '--sandbox',
    'read-only',
    '--output-schema',
    schemaPath,
    '-o',
    outputPath,
    prompt
  ];
  const commandResult = runCommand('codex', args, { cwd: root, timeoutMs });
  const outputText = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : commandResult.stdout;
  writeRawResult(outDir, 'codex', commandResult, outputText);
  return normalizeRaterOutput({
    rater: 'codex',
    rawText: outputText,
    exitCode: commandResult.status,
    timedOut: commandResult.timedOut,
    stderr: commandResult.stderr,
    signal: commandResult.signal
  });
}

function runClaudeRater({ root, outDir, prompt, timeoutMs }) {
  const args = [
    '--print',
    '--output-format',
    'json',
    '--permission-mode',
    'plan',
    '--json-schema',
    JSON.stringify(raterOutputSchema),
    prompt
  ];
  const commandResult = runCommand('claude', args, { cwd: root, timeoutMs });
  const outputText = commandResult.stdout;
  writeRawResult(outDir, 'claude', commandResult, outputText);
  return normalizeRaterOutput({
    rater: 'claude',
    rawText: outputText,
    exitCode: commandResult.status,
    timedOut: commandResult.timedOut,
    stderr: commandResult.stderr,
    signal: commandResult.signal
  });
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const outDir = path.resolve(args.outDir ?? path.join(root, defaultOutDir));

  if (args.write) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
  }

  const verifyResult = runCommand('npm', ['run', 'nutrition:verify'], { cwd: root });
  if (verifyResult.status !== 0) {
    throw new Error('npm run nutrition:verify failed:\n' + verifyResult.stdout + verifyResult.stderr);
  }

  const gateResult = runCommand('npm', ['run', 'nutrition:gate', '--', '--no-write'], { cwd: root });
  const artifacts = loadTwoLevelArtifacts(root);
  const deterministicGate = parseDeterministicGateOutput(gateResult);
  const packet = buildRaterPacket({ ...artifacts, deterministicGate });
  const packetPath = path.join(outDir, 'rater-packet.json');
  const schemaPath = path.join(outDir, 'rater-output.schema.json');
  const codexPromptPath = path.join(outDir, 'codex-prompt.txt');
  const claudePromptPath = path.join(outDir, 'claude-prompt.txt');

  writeJson(packetPath, packet);
  writeJson(schemaPath, raterOutputSchema);
  const codexPrompt = buildRaterPrompt({ packetPath, raterName: 'Codex CLI' });
  const claudePrompt = buildRaterPrompt({ packetPath, raterName: 'Claude Code CLI' });
  writeFileSync(codexPromptPath, codexPrompt + '\n');
  writeFileSync(claudePromptPath, claudePrompt + '\n');

  const codex = runCodexRater({ root, outDir, schemaPath, prompt: codexPrompt, timeoutMs: args.timeoutMs });
  const claude = runClaudeRater({ root, outDir, prompt: claudePrompt, timeoutMs: args.timeoutMs });
  const summary = aggregateRaterRuns({ codex, claude });

  writeJson(path.join(outDir, 'codex-rater.json'), codex);
  writeJson(path.join(outDir, 'claude-rater.json'), claude);
  writeJson(path.join(outDir, 'llm-rater-summary.json'), {
    ...summary,
    artifacts: {
      packet: path.relative(root, packetPath),
      schema: path.relative(root, schemaPath),
      codex: path.relative(root, path.join(outDir, 'codex-rater.json')),
      claude: path.relative(root, path.join(outDir, 'claude-rater.json'))
    }
  });

  console.log('Dual-CLI nutrition rater');
  console.log('Codex: ' + codex.status + (codex.result?.verdict ? ' / ' + codex.result.verdict : ''));
  console.log('Claude: ' + claude.status + (claude.result?.verdict ? ' / ' + claude.result.verdict : ''));
  console.log('Final verdict: ' + summary.finalVerdict);
  console.log('Output: ' + path.relative(root, outDir));

  if (summary.finalVerdict !== 'pass') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error('Dual-CLI nutrition rater failed:');
    console.error(error.message);
    process.exit(1);
  }
}
