#!/usr/bin/env node
/* free-llm-radar: asks every free model in providers.json one short question and records whether it
   answered and how long it took. Results go to results/latest.json, a rolling history to
   results/history.json, and a table into the READMEs between the radar markers.
   No dependencies; Node 18 or newer. Providers whose key is not set are skipped. */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT = 'Reply with the single word: OK';
const TIMEOUT_MS = 45_000;
const KEEP_RUNS = 14;
const START = '<!-- radar:start -->';
const END = '<!-- radar:end -->';

/* "${CLOUDFLARE_ACCOUNT_ID}" in a base URL is filled from the environment; a missing value leaves the provider unusable. */
export function fillBase(base, env) {
  let missing = false;
  const out = base.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!env[name]) missing = true;
    return env[name] || '';
  });
  return missing ? null : out;
}

/* Which models to ask. A fixed list is used as given; otherwise the provider's /models list is read:
   "free-suffix" keeps ids ending in ":free" (newest first when the list says when each was added),
   "all" keeps everything except ids containing one of `skip`. At most `max` either way. */
export function pickModels(provider, listed = []) {
  const max = provider.max || 10;
  if (Array.isArray(provider.models)) return provider.models.slice(0, max);
  const skip = (provider.skip || []).map((s) => s.toLowerCase());
  let rows = listed.filter((m) => m && typeof m.id === 'string');
  if (provider.discover === 'free-suffix') rows = rows.filter((m) => m.id.endsWith(':free'));
  else rows = rows.filter((m) => !skip.some((s) => m.id.toLowerCase().includes(s)));
  rows.sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0) || a.id.localeCompare(b.id));
  return rows.slice(0, max).map((m) => m.id);
}

function headers(provider, key) {
  const out = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  if (provider.id === 'openrouter') {
    out['HTTP-Referer'] = 'https://github.com/Owaid0723666/free-llm-radar';
    out['X-Title'] = 'free-llm-radar';
  }
  return out;
}

async function listModels(provider, base, key, fetchImpl) {
  const res = await fetchImpl(`${base}/models`, { headers: headers(provider, key), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`models list HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.data) ? body.data : [];
}

/* One question, one answer. "Answered" means the reply carried some text (or reasoning text, for
   models that think first). The error kept is the HTTP status or a short reason, never the body. */
export async function probe(provider, base, key, model, fetchImpl = fetch) {
  const started = Date.now();
  try {
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: headers(provider, key),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 32, temperature: 0 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => null);
    const msg = body?.choices?.[0]?.message || {};
    const text = [msg.content, msg.reasoning_content, msg.reasoning].find((t) => typeof t === 'string' && t.trim());
    return text ? { ok: true, ms } : { ok: false, ms, error: 'empty reply' };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error?.name === 'TimeoutError' ? 'timeout' : 'network error' };
  }
}

/* The last KEEP_RUNS results per provider/model, newest last. A model no longer asked keeps its old runs. */
export function mergeHistory(history, run, day) {
  const out = { ...history };
  for (const row of run) {
    const key = `${row.provider}/${row.model}`;
    const past = (out[key] || []).filter((h) => h.d !== day);
    out[key] = [...past, { d: day, ok: row.ok, ms: row.ms }].slice(-KEEP_RUNS);
  }
  return out;
}

const WORDS = {
  en: { head: '| Provider | Model | Latest | Time | Last 7 runs |', ok: 'answered', fail: 'failed', none: 'no models listed' },
  zh: { head: '| 服务商 | 模型 | 最近一次 | 用时 | 最近 7 次 |', ok: '能用', fail: '失败', none: '没取到模型' },
};

export function renderTable(run, history, providers, lang = 'en') {
  const w = WORDS[lang];
  const names = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  const order = providers.map((p) => p.id);
  const rows = [...run].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider) || Number(b.ok) - Number(a.ok) || a.ms - b.ms);
  const lines = [w.head, '| --- | --- | --- | ---: | ---: |'];
  for (const r of rows) {
    const past = (history[`${r.provider}/${r.model}`] || []).slice(-7);
    const good = past.filter((h) => h.ok).length;
    const latest = r.ok ? w.ok : `${w.fail} (${r.error})`;
    const time = r.ok ? `${(r.ms / 1000).toFixed(1)}s` : '—';
    lines.push(`| ${names[r.provider] || r.provider} | \`${r.model}\` | ${latest} | ${time} | ${good}/${past.length} |`);
  }
  return lines.join('\n');
}

export function injectReadme(readme, block) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) return readme;
  return `${readme.slice(0, a + START.length)}\n${block}\n${readme.slice(b)}`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function runProvider(provider, env, fetchImpl) {
  const key = env[provider.keyEnv];
  const base = fillBase(provider.base, env);
  if (!key || !base) return { skipped: true, rows: [] };
  let models;
  try {
    models = pickModels(provider, provider.models ? [] : await listModels(provider, base, key, fetchImpl));
  } catch (error) {
    console.error(`[${provider.id}] could not list models: ${error.message}`);
    return { skipped: false, rows: [] };
  }
  const rows = [];
  /* one at a time per provider, so a free tier's per-minute limit is not what gets measured */
  for (const model of models) rows.push({ provider: provider.id, model, ...(await probe(provider, base, key, model, fetchImpl)) });
  return { skipped: false, rows };
}

export async function main({ env = process.env, fetchImpl = fetch, dir = HERE, now = new Date() } = {}) {
  const providers = await readJson(path.join(dir, 'providers.json'), []);
  const day = now.toISOString().slice(0, 10);
  const results = await Promise.all(providers.map((p) => runProvider(p, env, fetchImpl)));
  const ran = providers.filter((_, i) => !results[i].skipped);
  const run = results.flatMap((r) => r.rows);
  for (const p of providers.filter((_, i) => results[i].skipped)) console.log(`[${p.id}] skipped: ${p.keyEnv} not set`);
  if (!run.length) {
    console.error('Nothing was tested. Set at least one provider key.');
    return { run };
  }
  const history = mergeHistory(await readJson(path.join(dir, 'results', 'history.json'), {}), run, day);
  await fs.mkdir(path.join(dir, 'results'), { recursive: true });
  await fs.writeFile(path.join(dir, 'results', 'latest.json'), `${JSON.stringify({ at: now.toISOString(), results: run }, null, 2)}\n`);
  await fs.writeFile(path.join(dir, 'results', 'history.json'), `${JSON.stringify(history, null, 2)}\n`);
  const stamp = `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  for (const [file, lang] of [['README.md', 'en'], ['README.zh-CN.md', 'zh']]) {
    const readme = await fs.readFile(path.join(dir, file), 'utf8').catch(() => '');
    if (!readme) continue;
    const note = lang === 'en' ? `Last run: ${stamp}. ${run.filter((r) => r.ok).length} of ${run.length} models answered.` : `最近一次：${stamp}。${run.length} 个模型里 ${run.filter((r) => r.ok).length} 个能用。`;
    await fs.writeFile(path.join(dir, file), injectReadme(readme, `${note}\n\n${renderTable(run, history, ran, lang)}`));
  }
  console.log(`${run.filter((r) => r.ok).length}/${run.length} models answered`);
  return { run };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
