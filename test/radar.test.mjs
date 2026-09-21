import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fillBase, injectReadme, main, mergeHistory, pickModels, probe, renderTable } from '../radar.mjs';

test('fillBase fills ${VAR} from the environment and gives up when it is missing', () => {
  assert.equal(fillBase('https://x/${A}/v1', { A: 'acct' }), 'https://x/acct/v1');
  assert.equal(fillBase('https://x/${A}/v1', {}), null);
  assert.equal(fillBase('https://x/v1', {}), 'https://x/v1');
});

test('pickModels: fixed list as given; discovery keeps :free (newest first) or drops skipped words', () => {
  assert.deepEqual(pickModels({ models: ['a', 'b', 'c'], max: 2 }), ['a', 'b']);
  const listed = [{ id: 'x:free', created: 1 }, { id: 'y', created: 5 }, { id: 'z:free', created: 9 }];
  assert.deepEqual(pickModels({ discover: 'free-suffix' }, listed), ['z:free', 'x:free']);
  assert.deepEqual(pickModels({ discover: 'all', skip: ['whisper'] }, [{ id: 'whisper-1' }, { id: 'llama' }]), ['llama']);
});

const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('probe: text or reasoning text counts as an answer; an empty reply or an HTTP error does not', async () => {
  const p = { id: 'x' };
  assert.equal((await probe(p, 'b', 'k', 'm', reply(200, { choices: [{ message: { content: 'OK' } }] }))).ok, true);
  assert.equal((await probe(p, 'b', 'k', 'm', reply(200, { choices: [{ message: { content: '', reasoning_content: 'thinking' } }] }))).ok, true);
  assert.deepEqual((await probe(p, 'b', 'k', 'm', reply(200, { choices: [{ message: { content: '' } }] }))).error, 'empty reply');
  assert.equal((await probe(p, 'b', 'k', 'm', reply(429, {}))).error, 'HTTP 429');
});

test('mergeHistory keeps one result per day and the last 14 runs', () => {
  let h = {};
  for (let d = 1; d <= 20; d += 1) h = mergeHistory(h, [{ provider: 'p', model: 'm', ok: d % 2 === 0, ms: d }], `2026-01-${String(d).padStart(2, '0')}`);
  h = mergeHistory(h, [{ provider: 'p', model: 'm', ok: true, ms: 99 }], '2026-01-20');
  assert.equal(h['p/m'].length, 14);
  assert.deepEqual(h['p/m'].at(-1), { d: '2026-01-20', ok: true, ms: 99 });
});

test('renderTable and injectReadme put a table between the markers and leave the rest alone', () => {
  const run = [{ provider: 'p', model: 'm', ok: false, ms: 10, error: 'HTTP 500' }, { provider: 'p', model: 'n', ok: true, ms: 1234 }];
  const table = renderTable(run, { 'p/n': [{ ok: true }, { ok: false }] }, [{ id: 'p', name: 'P' }]);
  assert.match(table, /\| P \| `n` \| answered \| 1\.2s \| 1\/2 \|/);
  assert.ok(table.indexOf('`n`') < table.indexOf('`m`'), 'answered models first');
  const out = injectReadme('top\n<!-- radar:start -->\nold\n<!-- radar:end -->\nbottom', 'NEW');
  assert.equal(out, 'top\n<!-- radar:start -->\nNEW\n<!-- radar:end -->\nbottom');
});

test('main: skips providers without a key, writes results and fills both READMEs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-'));
  try {
    await fs.writeFile(path.join(dir, 'providers.json'), JSON.stringify([
      { id: 'a', name: 'A', base: 'https://a/v1', keyEnv: 'A_KEY', models: ['m1'] },
      { id: 'b', name: 'B', base: 'https://b/v1', keyEnv: 'B_KEY', models: ['m2'] },
    ]));
    for (const f of ['README.md', 'README.zh-CN.md']) await fs.writeFile(path.join(dir, f), 'x\n<!-- radar:start -->\n<!-- radar:end -->\n');
    const log = console.log;
    console.log = () => {};
    try {
      await main({ env: { A_KEY: 'k' }, dir, now: new Date('2026-09-21T00:00:00Z'), fetchImpl: reply(200, { choices: [{ message: { content: 'OK' } }] }) });
    } finally {
      console.log = log;
    }
    const latest = JSON.parse(await fs.readFile(path.join(dir, 'results', 'latest.json'), 'utf8'));
    assert.deepEqual(latest.results.map((r) => `${r.provider}/${r.model}/${r.ok}`), ['a/m1/true']);
    assert.match(await fs.readFile(path.join(dir, 'README.md'), 'utf8'), /1 of 1 models answered[\s\S]*\| A \| `m1` \| answered/);
    assert.match(await fs.readFile(path.join(dir, 'README.zh-CN.md'), 'utf8'), /\| A \| `m1` \| 能用/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
