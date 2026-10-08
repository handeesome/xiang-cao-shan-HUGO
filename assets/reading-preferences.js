(() => {
  "use strict";
  const KEY = "xiangcaoshan.typography.v1";
  const MIN_SIZE = 14;
  const MAX_SIZE = 26;
  const root = document.documentElement;
  const validFont = (font) => ["sans", "serif", "mixed"].includes(font);
  let font = "mixed";
  let size = null;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (validFont(saved?.font)) font = saved.font;
    if (Number.isInteger(saved?.size) && saved.size >= MIN_SIZE && saved.size <= MAX_SIZE) size = saved.size;
  } catch {}

  // Apply before the article is painted, including when reading position restores.
  const apply = () => {
    root.dataset.readingFont = font;
    if (size === null) root.style.removeProperty("--reading-text-size");
    else root.style.setProperty("--reading-text-size", `${size}px`);
  };
  apply();

  document.addEventListener("DOMContentLoaded", () => {
    const control = document.querySelector(".reading-preferences");
    const article = document.querySelector("body[data-reading-path] .book-article");
    if (!control || !article) return;
    const toggle = control.querySelector(".reading-preferences-toggle");
    const panel = control.querySelector(".reading-preferences-panel");
    const fonts = Array.from(control.querySelectorAll("[data-reading-font]"));
    const steps = Array.from(control.querySelectorAll("[data-reading-size]"));
    const output = control.querySelector(".reading-size-value");
    const bodySize = () => size ?? Math.round(parseFloat(getComputedStyle(article).fontSize));
    const sync = () => {
      fonts.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.readingFont === font)));
      output.value = String(bodySize());
      steps.forEach((button) => {
        button.disabled = Number(button.dataset.readingSize) < 0 ? bodySize() <= MIN_SIZE : bodySize() >= MAX_SIZE;
      });
    };
    const setOpen = (open) => {
      control.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      panel.setAttribute("aria-hidden", String(!open));
      panel.inert = !open;
    };
    const update = (change) => {
      const blocks = Array.from(article.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote, figure"));
      // The mobile header slides in on tap and away on scroll. Its animated
      // edge cannot be a stable reference for a typography change.
      const edge = 0;
      const anchor = blocks.find((block) => {
        const rect = block.getBoundingClientRect();
        return rect.bottom > edge && rect.height > 0;
      });
      const before = anchor?.getBoundingClientRect();
      const fraction = before && before.top < edge ? (edge - before.top) / before.height : 0;
      const y = window.scrollY;
      change();
      apply();
      sync();
      // Keep the same paragraph and relative point at the viewport edge.
      if (anchor && before && y > 8) {
        const after = anchor.getBoundingClientRect();
        const target = fraction > 0 ? edge - fraction * after.height : before.top;
        window.scrollTo({ top: Math.max(0, window.scrollY + after.top - target), behavior: "instant" });
      }
      try { localStorage.setItem(KEY, JSON.stringify({ font, size })); } catch {}
    };
    fonts.forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.readingFont === font) return;
      update(() => { font = button.dataset.readingFont; });
    }));
    steps.forEach((button) => button.addEventListener("click", () => {
      const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, bodySize() + Number(button.dataset.readingSize)));
      if (next === bodySize()) return;
      update(() => { size = next; });
    }));
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("pointerdown", (event) => {
      if (!control.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus({ preventScroll: true });
      }
    });
    ["menu-control", "toc-control"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setOpen(false));
    });
    document.addEventListener("reading-controls-hidden", () => setOpen(false));
    window.addEventListener("resize", sync, { passive: true });
    sync();
    control.hidden = false;
  });
})();
