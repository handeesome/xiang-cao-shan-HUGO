const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

async function player(cues) {
  const element = (tagName, textContent) => ({
    tagName, textContent, active: false,
    classList: { add() { this.owner.active = true; }, remove() { this.owner.active = false; } },
  });
  const elements = [element('H1', '第二章'), element('P', '亲爱的弟兄姊妹今天我们读第二章')];
  elements.forEach(el => el.classList.owner = el);
  const events = {};
  const audio = {
    dataset: { syncSrc: '/example.json' }, currentTime: 0,
    closest: () => ({ querySelectorAll: () => elements }),
    addEventListener: (name, fn) => events[name] = fn,
  };
  let ready;
  vm.runInNewContext(readFileSync(join(__dirname, '../static/js/audio-text-sync.js'), 'utf8'), {
    document: { addEventListener: (_, fn) => ready = fn, querySelectorAll: () => [audio] },
    fetch: async () => ({ ok: true, json: async () => ({ cues }) }), console,
  });
  ready();
  await new Promise(resolve => setImmediate(resolve));
  return { elements, update(time) { audio.currentTime = time; events.timeupdate?.(); } };
}

test('legacy heading cues are not highlighted and body keeps its original index', async () => {
  const p = await player([
    { start: 0, end: 1, kind: 'heading', targetIndex: 0, targetText: '第二章' },
    { start: 1.62, end: 12.62, kind: 'paragraph', targetIndex: 1, targetText: '亲爱的弟兄姊妹' },
  ]);
  p.update(.5);
  assert.equal(p.elements[0].active, false);
  p.update(1.62);
  assert.equal(p.elements[1].active, true);
  p.update(13);
  assert.equal(p.elements[1].active, false);
});

test('heading target is ignored even if a legacy cue has no kind', async () => {
  const p = await player([{ start: 0, end: 20, targetIndex: 0, targetText: '第二章' }]);
  p.update(5);
  assert.equal(p.elements[0].active, false);
});

test('seek before paragraph start clears its highlight', async () => {
  const p = await player([{ start: 1.62, end: 12.62, kind: 'paragraph', targetIndex: 1, targetText: '亲爱的弟兄姊妹' }]);
  p.update(6);
  assert.equal(p.elements[1].active, true);
  p.update(1);
  assert.equal(p.elements[1].active, false);
});
