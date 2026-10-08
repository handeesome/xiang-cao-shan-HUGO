const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('static/js/mobile-reading-controls.js', 'utf8');

function page({ mobile = true, y = 0 } = {}) {
  class Element extends EventTarget {
    constructor() {
      super(); const names = new Set();
      this.classList = { add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name) };
      this.style = { setProperty() {}, removeProperty() {} };
    }
  }
  const window = new EventTarget();
  Object.assign(window, { scrollY: y, innerHeight: 800 });
  const media = new EventTarget(); media.matches = mobile;
  window.matchMedia = () => media;
  const document = new EventTarget();
  document.body = new Element();
  document.documentElement = { scrollHeight: 3000 };
  const header = new Element(); header.offsetHeight = 64;
  const audios = [200, 1200].map(top => {
    const audio = new Element(); audio.pauseCalls = 0;
    audio.getBoundingClientRect = () => ({ top: top - window.scrollY });
    audio.pause = () => audio.pauseCalls++;
    return audio;
  });
  const menu = new Element(), toc = new Element();
  menu.checked = false; toc.checked = false;
  document.getElementById = id => id === 'menu-control' ? menu : toc;
  document.querySelector = selector => selector === '.book-header' ? header : { querySelectorAll: () => audios };
  let now = 10000, next = 1;
  const frames = new Map();
  const flush = () => { while (frames.size) { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(); } };
  vm.runInNewContext(source, { window, document, Date: { now: () => now }, Event,
    requestAnimationFrame: fn => { const id = next++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id) });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const hidden = () => document.body.classList.contains('reading-controls-hidden');
  const gesture = type => document.dispatchEvent(new Event(type));
  const scroll = (top, user = true) => {
    if (user) gesture('wheel');
    window.scrollY = top; window.dispatchEvent(new Event('scroll')); flush();
  };
  const key = key => { const event = new Event('keydown'); event.key = key; document.dispatchEvent(event); };
  return { document, window, audios, media, menu, toc, flush, scroll, hidden, gesture, key, expire: () => { now += 2000; } };
}

test('downward reading hides controls; upward reading reveals them without a tap', () => {
  const p = page();
  p.scroll(400); assert.equal(p.hidden(), true);
  p.scroll(390); assert.equal(p.hidden(), false);
  p.scroll(410); assert.equal(p.hidden(), true);
});

test('a tap on prose no longer reveals hidden controls', () => {
  const p = page(); p.scroll(400);
  p.gesture('pointerdown'); p.gesture('click');
  assert.equal(p.hidden(), true);
});

test('small direction changes do not make the bars flicker', () => {
  const p = page({ y: 100 });
  p.scroll(105); p.scroll(111); assert.equal(p.hidden(), false);
  p.scroll(113); assert.equal(p.hidden(), true);
  p.scroll(109); p.scroll(106); assert.equal(p.hidden(), true);
  p.scroll(104); assert.equal(p.hidden(), false);
});

test('programmatic restoration and expired gestures leave control visibility alone', () => {
  const p = page(); p.scroll(500, false); assert.equal(p.hidden(), false);
  p.scroll(530); assert.equal(p.hidden(), true);
  p.expire(); p.scroll(450, false); assert.equal(p.hidden(), true);
  p.gesture('pointerdown'); p.scroll(600, false); assert.equal(p.hidden(), true);
});

test('touch and keyboard scrolling both follow the same direction rules', () => {
  const p = page(); p.gesture('touchmove'); p.scroll(400, false);
  assert.equal(p.hidden(), true);
  p.key('ArrowUp'); p.scroll(380, false); assert.equal(p.hidden(), false);
  p.key('PageDown'); p.scroll(900, false); assert.equal(p.hidden(), true);
  p.key('Tab'); assert.equal(p.hidden(), false);
});

test('opening navigation keeps controls visible and closing it rebases restored scroll', () => {
  for (const which of ['menu', 'toc']) {
    const p = page(); p.scroll(400);
    p[which].checked = true; p[which].dispatchEvent(new Event('change')); p.flush();
    assert.equal(p.hidden(), false);
    p.scroll(0, false);
    p[which].checked = false; p[which].dispatchEvent(new Event('change'));
    p.scroll(400, false);
    assert.equal(p.hidden(), false);
  }
});

test('the top is always visible; elastic bottom overscroll is not a direction reversal', () => {
  const p = page(); p.scroll(2100); p.scroll(2300);
  assert.equal(p.hidden(), true);
  p.scroll(2240); assert.equal(p.hidden(), true);
  p.scroll(2190); assert.equal(p.hidden(), false);
  p.scroll(-20); assert.equal(p.hidden(), false);
});

test('visibility changes do not pause playback; crossing an audio segment still does', () => {
  const p = page(); p.scroll(400); p.scroll(700); p.scroll(650);
  assert.equal(p.audios[0].pauseCalls, 0);
  p.scroll(1400);
  assert.equal(p.audios[0].pauseCalls, 1);
  assert.equal(p.audios[1].classList.contains('audio-reading-control-active'), true);
});

test('one hide notification collapses font preferences, without repeated events while hidden', () => {
  const p = page(); let count = 0;
  p.document.addEventListener('reading-controls-hidden', () => count++);
  p.scroll(400); p.scroll(700); assert.equal(count, 1);
  p.scroll(680); p.scroll(720); assert.equal(count, 2);
});

test('desktop views do not hide and resizing out of mobile reveals the controls', () => {
  const desktop = page({ mobile: false }); desktop.scroll(400);
  assert.equal(desktop.hidden(), false);
  const p = page(); p.scroll(400); p.media.matches = false;
  p.media.dispatchEvent(new Event('change')); p.flush();
  assert.equal(p.hidden(), false);
  assert.equal(p.audios.some(audio => audio.classList.contains('audio-reading-control-active')), false);
});

test('responsive reflow after a recent gesture does not dismiss visible controls', () => {
  const p = page(); p.scroll(400); p.scroll(380);
  p.window.dispatchEvent(new Event('resize'));
  p.scroll(600, false);
  assert.equal(p.hidden(), false);
});
