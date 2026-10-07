(() => {
  "use strict";

  const KEY = "xiangcaoshan.reading.v1";
  const settings = document.currentScript.dataset;
  const home = new URL(settings.homePath, location.origin);
  const validPath = (value) => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin || url.search || url.hash) return null;
      if (!["books/", "children/"].some((section) => url.pathname.startsWith(home.pathname + section))) return null;
      return url.pathname.replace(/%[a-f0-9]{2}/gi, (part) => part.toUpperCase());
    } catch {
      return null;
    }
  };
  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw?.length > 300000) return { version: 1, pages: {} };
      const data = JSON.parse(raw);
      if (data?.version === 1 && data.pages && typeof data.pages === "object" && !Array.isArray(data.pages)) return data;
    } catch {}
    return { version: 1, pages: {} };
  };
  const write = (data) => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  };

  if (settings.isHome === "true" && !location.search && !location.hash) {
    const data = read();
    const path = validPath(data.lastPath);
    if (path && data.pages[path] && Number.isFinite(data.pages[path].scrollY)) {
      location.replace(path);
      return;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Explicit home links stay on the homepage, including when opened in a new tab.
    document.querySelectorAll("a[href]").forEach((link) => {
      const url = new URL(link.href, location.href);
      if (url.origin === home.origin && url.pathname === home.pathname && !url.search && !url.hash) {
        url.searchParams.set("home", "1");
        link.href = url.href;
      }
    });

    const path = validPath(document.body.dataset.readingPath);
    const article = document.querySelector(".book-article");
    if (!path || !article) return;

    const saved = read().pages[path];
    const audios = Array.from(article.querySelectorAll("audio"));
    // Floating audio controls move independently of the text and cannot be anchors.
    const blocks = Array.from(article.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote, figure"));
    const text = (node) => (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const audioKey = (audio) => {
      const src = audio.querySelector("source")?.src || audio.currentSrc || audio.src;
      if (!src) return "";
      const url = new URL(src, location.href);
      return url.searchParams.has("src")
        ? JSON.stringify([url.searchParams.get("book"), url.searchParams.get("src"), url.searchParams.get("v")])
        : url.href;
    };
    let audioProgress = saved?.audio && typeof saved.audio.key === "string" && Number.isFinite(saved.audio.time) && saved.audio.time >= 0
      ? { ...saved.audio } : null;
    const rememberedAudio = audioProgress && audios.find((audio) => audioKey(audio) === audioProgress.key);
    if (audioProgress && !rememberedAudio) audioProgress = null;
    let pendingAudio = Boolean(rememberedAudio && audioProgress.time > 0 && !audioProgress.finished);
    const back = performance.getEntriesByType("navigation")[0]?.type === "back_forward";
    let restoreAllowed = Boolean(saved && Number.isFinite(saved.scrollY) && !location.hash && !back);
    let restoring = restoreAllowed;
    let saveTimer;
    let restoreObserver;
    const restoreUntil = Date.now() + 5000;

    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (restoring || document.body.classList.contains("book-menu-open")) return;
      const y = Math.max(0, window.scrollY);
      let anchor = null;
      if (y > 8) {
        let node = blocks[0];
        for (const block of blocks) {
          if (block.getBoundingClientRect().top <= 0) node = block;
        }
        if (node) {
          const rect = node.getBoundingClientRect();
          anchor = { index: blocks.indexOf(node), id: node.id, text: text(node), top: rect.top, height: rect.height };
        }
      }
      const data = read();
      data.pages[path] = { scrollY: y, width: innerWidth, anchor, audio: audioProgress, updatedAt: Date.now() };
      if (!document.hidden) data.lastPath = path;
      Object.keys(data.pages).sort((a, b) => (data.pages[b]?.updatedAt || 0) - (data.pages[a]?.updatedAt || 0))
        .slice(30).forEach((key) => delete data.pages[key]);
      write(data);
    };
    const scheduleSave = () => {
      if (!saveTimer) saveTimer = setTimeout(save, 400);
    };
    const restorePosition = () => {
      if (!restoreAllowed || Date.now() > restoreUntil) return;
      let top = Math.max(0, saved.scrollY);
      const anchor = saved.anchor;
      if (anchor && Number.isInteger(anchor.index) && Number.isFinite(anchor.top)) {
        let node = anchor.id && blocks.find((block) => block.id === anchor.id);
        node ||= blocks[anchor.index] && text(blocks[anchor.index]) === anchor.text ? blocks[anchor.index] : null;
        node ||= anchor.text && blocks.find((block) => text(block) === anchor.text);
        if (node) {
          const rect = node.getBoundingClientRect();
          const offset = saved.width !== innerWidth && anchor.height > 0 ? anchor.top * rect.height / anchor.height : anchor.top;
          top = rect.top + window.scrollY - offset;
        }
      }
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    };
    const cancelRestore = () => {
      restoreAllowed = false;
      restoring = false;
      restoreObserver?.disconnect();
    };
    ["wheel", "touchstart", "pointerdown", "keydown"].forEach((event) => {
      document.addEventListener(event, cancelRestore, { passive: true, once: true });
    });

    const showNotice = () => {
      const notice = document.createElement("div");
      notice.className = "reading-resume-notice";
      const message = document.createElement("span");
      message.setAttribute("role", "status");
      message.textContent = "已回到上次阅读位置";
      const restart = document.createElement("button");
      restart.type = "button";
      restart.textContent = "从头开始";
      restart.addEventListener("click", () => {
        cancelRestore();
        pendingAudio = false;
        audios.forEach((audio) => {
          audio.pause();
          try { audio.currentTime = 0; } catch {}
        });
        audioProgress = null;
        window.scrollTo({ top: 0, behavior: "instant" });
        save();
        notice.remove();
      });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "reading-resume-close";
      close.setAttribute("aria-label", "关闭提示");
      close.textContent = "×";
      close.addEventListener("click", () => notice.remove());
      notice.append(message, restart, close);
      document.body.append(notice);
      setTimeout(() => notice.remove(), 8000);
    };

    audios.forEach((audio) => {
      const capture = (event) => {
        if (audio.readyState < 1) return;
        if (audio.paused && audios.some((other) => other !== audio && !other.paused)) return;
        if (!["play", "seeking"].includes(event.type) && audio.currentTime === 0 && audioKey(audio) !== audioProgress?.key) return;
        if (pendingAudio && audio === rememberedAudio && event.type !== "seeking") return;
        pendingAudio = false;
        audioProgress = { key: audioKey(audio), time: audio.currentTime, finished: audio.ended };
        scheduleSave();
      };
      ["play", "pause", "timeupdate", "seeking", "seeked", "ended"].forEach((event) => audio.addEventListener(event, capture));
    });
    if (pendingAudio) {
      const restoreAudio = () => {
        if (!pendingAudio || rememberedAudio.readyState < 1 || !Number.isFinite(rememberedAudio.duration) || rememberedAudio.duration <= 0) return;
        const time = Math.min(audioProgress.time, Math.max(0, rememberedAudio.duration - 0.25));
        try {
          rememberedAudio.currentTime = time;
          pendingAudio = false;
        } catch {}
      };
      rememberedAudio.addEventListener("loadedmetadata", restoreAudio);
      rememberedAudio.addEventListener("durationchange", restoreAudio);
      if (rememberedAudio.readyState >= 1) restoreAudio();
      else if (rememberedAudio.dataset.metadataRequested !== "true") {
        rememberedAudio.dataset.metadataRequested = "true";
        rememberedAudio.preload = "metadata";
        rememberedAudio.load();
      }
    }

    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
    window.addEventListener("load", restorePosition, { once: true });
    document.fonts?.ready.then(restorePosition);
    if (restoreAllowed && "ResizeObserver" in window) {
      restoreObserver = new ResizeObserver(restorePosition);
      restoreObserver.observe(article);
      setTimeout(() => restoreObserver.disconnect(), 5000);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      restorePosition();
      restoring = false;
      if (restoreAllowed && (saved.scrollY > 32 || pendingAudio || audioProgress?.time > 0)) showNotice();
      save();
    }));
  });
})();
