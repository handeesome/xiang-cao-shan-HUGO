const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('assets/reading-progress.js', 'utf8');
const KEY = 'xiangcaoshan.reading.v1';
const PATH = '/books/book/chapter/';
const audioKey = (name, version = '1') => JSON.stringify(['book', name, version]);
const record = (entry, lastPath = PATH) => ({ version: 1, lastPath, pages: { [PATH]: { scrollY: 250, width: 390, ...entry } } });

function harness(options = {}) {
  const frames = [], timers = new Map();
  let nextTimer = 1, replaced;
  const storage = new Map([[KEY, typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved ?? null)]]);
  const window = new EventTarget();
  window.scrollY = options.y ?? 0;
  window.scrollTo = ({ top }) => { window.scrollY = top; };
  class Element extends EventTarget {
    constructor(text = '', top = 0, height = 100, id = '') {
      super(); Object.assign(this, { textContent: text, top, height, id, dataset: {}, children: [] });
      const classes = new Set();
      this.classList = { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x) };
    }
    getBoundingClientRect() { return { top: this.top - window.scrollY, bottom: this.top - window.scrollY + this.height, height: this.height }; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    remove() { this.removed = true; }
  }
  const blocks = options.blocks ?? [new Element('Chapter', 0, 40, 'chapter'), new Element('A paragraph', 100, 400)];
  const audios = (options.audioNames ?? []).map(name => {
    const audio = new Element('', 0, 54);
    Object.assign(audio, { currentTime: 0, readyState: 0, duration: NaN, paused: true, ended: false, loadCalls: 0, playCalls: 0 });
    audio.querySelector = () => ({ src: `https://site.test/.netlify/functions/audio?book=book&src=${name}&v=1` });
    audio.load = () => { audio.loadCalls++; };
    audio.pause = () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); };
    audio.play = () => { audio.playCalls++; audio.paused = false; audio.dispatchEvent(new Event('play')); };
    return audio;
  });
  const article = new Element();
  article.querySelectorAll = selector => selector === 'audio' ? audios : blocks;
  const links = [Object.assign(new Element(), { href: 'https://site.test/' })];
  const document = new EventTarget();
  document.currentScript = { dataset: { homePath: '/', isHome: String(Boolean(options.home)) } };
  document.body = new Element(); document.body.dataset.readingPath = options.home ? undefined : PATH;
  document.querySelector = () => article;
  document.querySelectorAll = () => links;
  document.createElement = () => new Element();
  document.hidden = false;
  const url = new URL(options.url ?? (options.home ? 'https://site.test/' : `https://site.test${PATH}`));
  const location = { origin: url.origin, href: url.href, search: url.search, hash: url.hash, replace: path => { replaced = path; } };
  const context = { document, window, location, URL, innerWidth: options.width ?? 390,
    performance: { getEntriesByType: () => [{ type: options.navigation ?? 'navigate' }] },
    localStorage: { getItem: key => { if (options.blockStorage) throw Error('blocked'); return storage.get(key); }, setItem: (key, value) => { if (options.blockStorage) throw Error('blocked'); storage.set(key, value); } },
    requestAnimationFrame: fn => frames.push(fn),
    setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), console };
  vm.runInNewContext(source, context);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  while (frames.length) frames.shift()();
  const flush = () => { for (const [id, timer] of [...timers]) if (timer.delay === 400) { timers.delete(id); timer.fn(); } };
  return { window, document, blocks, audios, links, flush, replaced, state: () => JSON.parse(storage.get(KEY)), notice: () => document.body.children.find(el => el.className === 'reading-resume-notice') };
}

test('saves a paragraph anchor and retains at most 30 pages', () => {
  const saved = record({});
  for (let i = 0; i < 40; i++) saved.pages[`/books/old/${i}/`] = { updatedAt: i };
  const h = harness({ y: 250, saved });
  assert.equal(h.state().lastPath, PATH);
  assert.equal(h.state().pages[PATH].anchor.text, 'A paragraph');
  assert.equal(Object.keys(h.state().pages).length, 30);
});
test('restores the same paragraph after preceding content moves', () => {
  const h = harness({ saved: record({ anchor: { index: 1, text: 'A paragraph', top: -150, height: 400 } }) });
  assert.equal(h.window.scrollY, 250);
  h.blocks[1].top = 600;
  h.window.dispatchEvent(new Event('load'));
  assert.equal(h.window.scrollY, 750);
});
test('preserves progress through a paragraph when the viewport changes', () => {
  const h = harness({ width: 320, saved: record({ anchor: { index: 1, text: 'A paragraph', top: -150, height: 200 } }) });
  assert.equal(h.window.scrollY, 400);
});
test('honors chapter fragments and native back navigation', () => {
  for (const options of [{ url: `https://site.test${PATH}#chapter` }, { navigation: 'back_forward' }]) {
    const h = harness({ ...options, y: 120, saved: record({}) });
    assert.equal(h.window.scrollY, 120);
    assert.equal(h.notice(), undefined);
  }
});
test('returns from a fresh homepage opening to the latest chapter', () => {
  assert.equal(harness({ home: true, saved: record({}) }).replaced, PATH);
});
test('explicit homepage links and queries stay on the homepage', () => {
  const h = harness();
  assert.equal(h.links[0].href, 'https://site.test/?home=1');
  assert.equal(harness({ home: true, url: 'https://site.test/?home=1', saved: record({}) }).replaced, undefined);
});
test('does not redirect to external, script, or non-reading URLs', () => {
  for (const path of ['https://evil.test/books/book/', 'javascript:alert(1)', '/music/', '/books/../', '/books/chapter/?other=1']) {
    assert.equal(harness({ home: true, saved: { version: 1, lastPath: path, pages: { [path]: { scrollY: 10 } } } }).replaced, undefined);
  }
});
test('malformed records and unavailable storage do not break reading', () => {
  assert.doesNotThrow(() => harness({ saved: '{bad json' }));
  assert.doesNotThrow(() => harness({ blockStorage: true }));
});
test('restores the selected audio after metadata arrives, without playing it', () => {
  const h = harness({ saved: record({ audio: { key: audioKey('two.mp3'), time: 24 } }), audioNames: ['one.mp3', 'two.mp3'] });
  h.audios[0].dispatchEvent(new Event('timeupdate'));
  const audio = h.audios[1];
  audio.duration = 60; audio.readyState = 1;
  audio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(audio.currentTime, 24);
  assert.equal(audio.paused, true);
  assert.equal(audio.playCalls, 0);
  assert.equal(audio.loadCalls, 1);
});
test('clamps audio progress when a recording becomes shorter and ignores old versions', () => {
  const h = harness({ saved: record({ audio: { key: audioKey('one.mp3'), time: 240 } }), audioNames: ['one.mp3'] });
  h.audios[0].duration = 20;
  h.audios[0].readyState = 1;
  h.audios[0].dispatchEvent(new Event('loadedmetadata'));
  assert.equal(h.audios[0].currentTime, 19.75);
  const old = harness({ saved: record({ audio: { key: audioKey('one.mp3', 'old'), time: 10 } }), audioNames: ['one.mp3'] });
  assert.equal(old.audios[0].loadCalls, 0);
});
test('pausing the previous clip does not replace the currently playing clip', () => {
  const h = harness({ audioNames: ['one.mp3', 'two.mp3'] });
  h.audios.forEach(audio => { audio.readyState = 1; });
  h.audios[0].currentTime = 24;
  h.audios[1].play();
  h.audios[0].pause(); h.flush();
  assert.equal(h.state().pages[PATH].audio.key, audioKey('two.mp3'));
});
test('user input stops delayed scroll correction', () => {
  const h = harness({ saved: record({}) });
  h.document.dispatchEvent(new Event('touchstart'));
  h.window.scrollY = 700;
  h.window.dispatchEvent(new Event('load'));
  assert.equal(h.window.scrollY, 700);
});
test('waits for usable metadata and ignores loading resets', () => {
  const h = harness({ saved: record({ audio: { key: audioKey('one.mp3'), time: 24 } }), audioNames: ['one.mp3'] });
  const audio = h.audios[0];
  audio.duration = 60;
  audio.dispatchEvent(new Event('durationchange'));
  audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(audio.currentTime, 0);
  audio.readyState = 1;
  audio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(audio.currentTime, 24);
});
test('restart clears reading and audio progress, including pending metadata seeks', () => {
  const h = harness({ saved: record({ audio: { key: audioKey('one.mp3'), time: 24 } }), audioNames: ['one.mp3'] });
  h.notice().children[1].dispatchEvent(new Event('click'));
  h.audios[0].duration = 60; h.audios[0].dispatchEvent(new Event('loadedmetadata'));
  assert.equal(h.window.scrollY, 0);
  assert.equal(h.audios[0].currentTime, 0);
  assert.equal(h.state().pages[PATH].audio, null);
});
test('opening the navigation drawer does not overwrite the reading position', () => {
  const h = harness({ y: 250 });
  h.document.body.classList.add('book-menu-open');
  h.window.scrollY = 0;
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.state().pages[PATH].scrollY, 250);
});
