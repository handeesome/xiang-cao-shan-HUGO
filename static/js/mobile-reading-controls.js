(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const mobileView = window.matchMedia("(max-width: 900px)");
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

    const showControls = () => {
      if (!mobileView.matches) return;
      document.body.classList.remove("reading-controls-hidden");
      updateActiveAudio();
    };

    const hideControls = () => {
      if (!mobileView.matches || navigationIsOpen()) return;
      document.body.classList.add("reading-controls-hidden");
    };

    window.addEventListener(
      "scroll",
      () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          updateActiveAudio();
          hideControls();
          scrollFrame = null;
        });
      },
      { passive: true }
    );

    document.addEventListener("click", showControls);
    document.addEventListener("keydown", (event) => {
      if (["Tab", "Enter", " ", "Escape"].includes(event.key)) {
        showControls();
      }
    });

    mobileView.addEventListener("change", () => {
      document.body.classList.remove("reading-controls-hidden");
      scheduleMeasure();
    });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("load", scheduleMeasure, { once: true });

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
