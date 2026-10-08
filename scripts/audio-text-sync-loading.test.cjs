const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const script = readFileSync(join(__dirname, '../static/js/audio-text-sync.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function page(count = 4, fetchData) {
  const requests = [];
  const warnings = [];
  let scans = 0;
  const paragraphs = Array.from({ length: count }, (_, index) => {
    const element = { tagName: 'P', textContent: `正文第${index + 1}段`, active: false };
    element.classList = {
      add: () => element.active = true,
      remove: () => element.active = false,
    };
    return element;
  });
  const article = { querySelectorAll: () => { scans++; return paragraphs; } };
  const audios = paragraphs.map((_, index) => {
    const events = new Map();
    return {
      dataset: { syncSrc: `/sync-${index}.json` },
      currentTime: 0,
      paused: true,
      closest: () => article,
      addEventListener(name, fn) {
        if (!events.has(name)) events.set(name, []);
        events.get(name).push(fn);
      },
      emit(name) {
        if (name === 'play') this.paused = false;
        if (name === 'ended') this.paused = true;
        for (const fn of events.get(name) || []) fn();
      },
    };
  });
  const response = index => ({
    ok: true,
    json: async () => ({ cues: [{
      start: 1, end: 10, kind: 'paragraph',
      targetIndex: index, targetText: paragraphs[index].textContent,
    }] }),
  });
  let ready;
  vm.runInNewContext(script, {
    document: {
      addEventListener: (_, fn) => ready = fn,
      querySelectorAll: () => audios,
    },
    fetch(url) {
      const index = Number(url.match(/sync-(\d+)/)[1]);
      requests.push(index);
      return fetchData ? fetchData(index, response) : Promise.resolve(response(index));
    },
    console: { warn: (...args) => warnings.push(args) },
  });
  ready();
  return { audios, paragraphs, requests, warnings, get scans() { return scans; } };
}

test('31-segment page initially loads one sync file and scans its article once', async () => {
  const p = page(31);
  await flush();
  assert.deepEqual(p.requests, [0]);
  assert.equal(p.scans, 1);
});

test('playing prepares only the next segment without highlighting it', async () => {
  const p = page();
  await flush();
  p.audios[0].currentTime = 5;
  p.audios[0].emit('play');
  await flush();
  assert.deepEqual(p.requests, [0, 1]);
  assert.equal(p.scans, 1);
  assert.deepEqual(p.paragraphs.map(el => el.active), [true, false, false, false]);
});

test('pointer, focus and play reuse an in-flight request', async () => {
  const pending = new Map();
  const p = page(4, (index, response) => new Promise(resolve => {
    pending.set(index, () => resolve(response(index)));
  }));
  p.audios[2].emit('pointerdown');
  p.audios[2].emit('focus');
  p.audios[2].currentTime = 5;
  p.audios[2].emit('play');
  p.audios[2].emit('seeking');
  assert.deepEqual(p.requests, [0, 2, 3]);
  pending.get(2)();
  await flush();
  assert.equal(p.paragraphs[2].active, true);
  assert.equal(p.scans, 1);
});

test('restoring a paused later segment loads it and highlights its saved time', async () => {
  const p = page();
  await flush();
  p.audios[2].currentTime = 5;
  p.audios[2].emit('seeking');
  p.audios[2].emit('seeked');
  await flush();
  assert.deepEqual(p.requests, [0, 2]);
  assert.equal(p.audios[2].paused, true);
  assert.equal(p.paragraphs[2].active, true);
  p.audios[2].currentTime = .5;
  p.audios[2].emit('timeupdate');
  assert.equal(p.paragraphs[2].active, false);
});

test('late responses cannot reactivate an earlier segment after a switch', async () => {
  const pending = new Map();
  const p = page(4, (index, response) => new Promise(resolve => {
    pending.set(index, () => resolve(response(index)));
  }));
  p.audios[0].currentTime = 5;
  p.audios[0].emit('play');
  p.audios[2].currentTime = 5;
  p.audios[2].emit('play');
  pending.get(2)();
  await flush();
  pending.get(0)();
  pending.get(1)();
  pending.get(3)();
  await flush();
  assert.deepEqual(p.paragraphs.map(el => el.active), [false, false, true, false]);
  assert.equal(p.scans, 1);
});

test('switching clears the old highlight and ignores its later time updates', async () => {
  const p = page();
  await flush();
  p.audios[0].currentTime = 5;
  p.audios[0].emit('play');
  await flush();
  p.audios[1].currentTime = 5;
  p.audios[1].emit('play');
  p.audios[0].emit('timeupdate');
  await flush();
  assert.deepEqual(p.paragraphs.map(el => el.active), [false, true, false, false]);
});

for (const event of ['ended', 'emptied']) {
  test(`${event} prevents pending data from adding a stale highlight`, async () => {
    let resolve;
    const p = page(1, (index, response) => new Promise(done => {
      resolve = () => done(response(index));
    }));
    p.audios[0].currentTime = 5;
    p.audios[0].emit('play');
    p.audios[0].emit(event);
    resolve();
    await flush();
    assert.equal(p.paragraphs[0].active, false);
  });
}

test('a failed sync request can be retried without blocking audio playback', async () => {
  let attempt = 0;
  const p = page(1, (index, response) => Promise.resolve(
    ++attempt === 1 ? { ok: false, status: 503 } : response(index)
  ));
  await flush();
  assert.equal(p.warnings.length, 1);
  p.audios[0].currentTime = 5;
  p.audios[0].emit('play');
  await flush();
  assert.equal(p.audios[0].paused, false);
  assert.deepEqual(p.requests, [0, 0]);
  assert.equal(p.paragraphs[0].active, true);
});

test('pages without synchronized audio do no loading or paragraph work', async () => {
  const p = page(0);
  await flush();
  assert.deepEqual(p.requests, []);
  assert.equal(p.scans, 0);
});
