(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const mobileView = window.matchMedia("(max-width: 1024px)");
    const header = document.querySelector(".book-header");
    const article = document.querySelector(".book-article");
    const audios = article
      ? Array.from(article.querySelectorAll("audio"))
      : [];
    if (!header) return;

    let audioPositions = [];
    let activeAudioIndex = -1;
    let scrollFrame;
    let measureFrame;
    const scrollY = () => Math.min(
      Math.max(0, window.scrollY),
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    );
    let lastScrollY = scrollY();
    let scrollDirection = 0;
    let directionDistance = 0;
    let scrollIntentUntil = 0;
    let revealProgress = 1;
    let touching = false;
    let settleTimer;
    const REVEAL_DISTANCE = 72;

    const navigationIsOpen = () =>
      ["menu-control", "toc-control"].some(
        (id) => document.getElementById(id)?.checked
      );

    const getAudioTop = () => header.offsetHeight + 8;

    const setActiveAudio = (nextIndex) => {
      const currentAudio = audios[activeAudioIndex];
      const nextAudio = audios[nextIndex];

      if (activeAudioIndex === nextIndex) {
        nextAudio?.style.setProperty(
          "--audio-reading-control-top",
          `${getAudioTop()}px`
        );
        return;
      }

      if (currentAudio && nextAudio) {
        currentAudio.pause();
      }

      currentAudio?.classList.remove("audio-reading-control-active");
      currentAudio?.style.removeProperty("--audio-reading-control-top");

      activeAudioIndex = nextIndex;

      if (nextAudio) {
        nextAudio.style.setProperty(
          "--audio-reading-control-top",
          `${getAudioTop()}px`
        );
        nextAudio.classList.add("audio-reading-control-active");
      }
    };

    const updateActiveAudio = () => {
      if (!mobileView.matches || !audios.length) {
        setActiveAudio(-1);
        return;
      }

      const threshold = window.scrollY + getAudioTop();
      let nextIndex = -1;

      audioPositions.forEach((position, index) => {
        if (position <= threshold) nextIndex = index;
      });

      setActiveAudio(nextIndex);
    };

    const measureAudioPositions = () => {
      const activeAudio = audios[activeAudioIndex];
      activeAudio?.classList.remove("audio-reading-control-active");

      audioPositions = audios.map(
        (audio) => audio.getBoundingClientRect().top + window.scrollY
      );

      activeAudio?.classList.add("audio-reading-control-active");
      updateActiveAudio();
    };

    const scheduleMeasure = () => {
      if (measureFrame) cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => {
        measureAudioPositions();
        measureFrame = null;
      });
    };

    const setProgress = (progress) => {
      revealProgress = Math.min(1, Math.max(0, progress));
      document.body.style.setProperty("--reading-controls-opacity", String(revealProgress));
      // Start exposing an edge even during a short, slow upward gesture.
      document.body.style.setProperty("--reading-controls-offset", String(1 - Math.sqrt(revealProgress)));
    };

    const stopTracking = () => {
      clearTimeout(settleTimer);
      document.body.classList.remove("reading-controls-tracking");
    };

    const showControls = () => {
      if (!mobileView.matches) return;
      stopTracking();
      setProgress(1);
      document.body.classList.remove("reading-controls-hidden");
      updateActiveAudio();
    };

    const hideControls = () => {
      if (!mobileView.matches || navigationIsOpen()) return;
      stopTracking();
      setProgress(0);
      if (document.body.classList.contains("reading-controls-hidden")) return;
      document.body.classList.add("reading-controls-hidden");
      document.dispatchEvent(new Event("reading-controls-hidden"));
    };

    const resetDirection = () => {
      lastScrollY = scrollY();
      scrollDirection = 0;
      directionDistance = 0;
    };

    const updateVisibility = () => {
      const y = scrollY();
      const delta = y - lastScrollY;
      lastScrollY = y;
      if (!mobileView.matches || navigationIsOpen() || y <= 8) {
        if (mobileView.matches) showControls();
        resetDirection();
        return;
      }
      // Restoring a reading position, following a chapter anchor, and resizing
      // text are layout changes, rather than a request to dismiss the controls.
      if (Date.now() > scrollIntentUntil) {
        resetDirection();
        return;
      }
      if (!delta) return;
      const direction = Math.sign(delta);
      if (direction !== scrollDirection) directionDistance = 0;
      scrollDirection = direction;
      directionDistance += Math.abs(delta);
      if (direction > 0 && revealProgress > 0 && revealProgress < 1) {
        setProgress(revealProgress - Math.abs(delta) / REVEAL_DISTANCE);
        if (revealProgress === 0) hideControls();
      }
      if (direction > 0 && directionDistance >= 12) hideControls();
      if (direction < 0 && revealProgress < 1) {
        if (!document.body.classList.contains("reading-controls-tracking")) {
          // A quick reversal continues from an in-flight fade, avoiding a flash.
          const opacity = parseFloat(getComputedStyle(header).opacity);
          if (Number.isFinite(opacity)) revealProgress = Math.max(revealProgress, opacity);
        }
        document.body.classList.add("reading-controls-tracking");
        setProgress(revealProgress + Math.abs(delta) / REVEAL_DISTANCE);
        if (revealProgress === 1) showControls();
      }
    };

    const settleReveal = () => {
      // Include the last scroll event if the finger lifts before its frame.
      updateVisibility();
      stopTracking();
      if (scrollDirection < 0 && revealProgress > 0) showControls();
      else if (revealProgress < 1) hideControls();
    };
    const scheduleSettle = () => {
      clearTimeout(settleTimer);
      if (!touching) settleTimer = setTimeout(settleReveal, 160);
    };
    const markScrollIntent = () => { scrollIntentUntil = Date.now() + 1800; };
    document.addEventListener("wheel", () => { markScrollIntent(); scheduleSettle(); }, { passive: true });
    document.addEventListener("touchstart", () => { touching = true; clearTimeout(settleTimer); }, { passive: true });
    document.addEventListener("touchmove", markScrollIntent, { passive: true });
    ["touchend", "touchcancel"].forEach((type) => document.addEventListener(type, () => {
      touching = false;
      settleReveal();
    }, { passive: true }));
    document.addEventListener("pointerdown", () => {
      if (revealProgress > 0 && revealProgress < 1) settleReveal();
      scrollIntentUntil = 0;
      resetDirection();
    }, { passive: true });

    window.addEventListener(
      "scroll",
      () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          updateActiveAudio();
          updateVisibility();
          scheduleSettle();
          scrollFrame = null;
        });
      },
      { passive: true }
    );

    document.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        markScrollIntent();
      }
      if (["Tab", "Escape"].includes(event.key)) {
        showControls();
        resetDirection();
      }
    });
    document.addEventListener("keyup", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) settleReveal();
    });
    document.addEventListener("focusin", (event) => {
      if (event.target.closest?.(".book-header, audio, .reading-preferences")) {
        showControls();
        resetDirection();
      }
    });
    ["menu-control", "toc-control"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        scrollIntentUntil = 0;
        if (navigationIsOpen()) showControls();
        requestAnimationFrame(resetDirection);
      });
    });

    mobileView.addEventListener("change", () => {
      stopTracking();
      setProgress(1);
      document.body.classList.remove("reading-controls-hidden");
      scrollIntentUntil = 0;
      resetDirection();
      scheduleMeasure();
    });
    window.addEventListener("resize", () => {
      stopTracking();
      setProgress(revealProgress > 0 ? 1 : 0);
      if (revealProgress === 1) document.body.classList.remove("reading-controls-hidden");
      scrollIntentUntil = 0;
      resetDirection();
      scheduleMeasure();
    });
    window.addEventListener("load", () => { resetDirection(); scheduleMeasure(); }, { once: true });

    if (audios.length && "ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(article);
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleMeasure);
    }

    measureAudioPositions();
  });
})();
