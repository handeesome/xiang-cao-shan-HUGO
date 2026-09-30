(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const audios = Array.from(document.querySelectorAll("audio"));
    if (!audios.length) return;

    audios.forEach((audio, index) => {
      audio.id ||= `chapter-audio-${index + 1}`;
      audio.setAttribute(
        "aria-label",
        audios.length === 1
          ? "章节音频"
          : `音频 ${index + 1}，共 ${audios.length} 段`
      );
    });

    const requestMetadata = (audio) => {
      if (!audio || audio.dataset.metadataRequested === "true") return;

      audio.dataset.metadataRequested = "true";
      audio.preload = "metadata";
      if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
        audio.load();
      }
    };

    requestMetadata(audios[0]);

    if ("IntersectionObserver" in window) {
      const metadataObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            requestMetadata(entry.target);
            metadataObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "600px 0px" }
      );

      audios.slice(1).forEach((audio) => metadataObserver.observe(audio));
    } else {
      audios.slice(1).forEach((audio) => {
        ["pointerdown", "focus"].forEach((eventName) => {
          audio.addEventListener(eventName, () => requestMetadata(audio), {
            once: true,
          });
        });
      });
    }

    if (audios.length === 1) return;

    const controls = document.createElement("div");
    controls.className = "audio-playlist-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "连续播放控制");

    const button = document.createElement("button");
    button.className = "play-all-button";
    button.type = "button";
    button.setAttribute("aria-controls", audios.map((audio) => audio.id).join(" "));

    const status = document.createElement("span");
    status.className = "audio-playlist-status";
    status.id = "audio-playlist-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    button.setAttribute("aria-describedby", status.id);

    controls.append(button, status);
    audios[0].parentNode?.insertBefore(controls, audios[0]);

    const suppressedPauses = new WeakSet();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let sequenceActive = false;
    let pausedFromButton = false;
    let currentIndex = 0;

    const setUi = (state, index = currentIndex) => {
      const position = `${index + 1} / ${audios.length}`;
      button.dataset.state = state;
      button.setAttribute("aria-pressed", String(state === "playing"));

      switch (state) {
        case "playing":
          button.textContent = "暂停连续播放";
          status.textContent = `正在播放 ${position}`;
          break;
        case "paused":
          button.textContent = "继续连续播放";
          status.textContent = `已暂停 ${position}`;
          break;
        case "stopped":
          button.textContent = "继续连续播放";
          status.textContent = `连续播放已停止 · 第 ${position} 段`;
          break;
        case "manual":
          button.textContent = "连续播放余下音频";
          status.textContent = `正在单独播放 ${position}`;
          break;
        case "complete":
          button.textContent = "重新播放全部";
          status.textContent = `已播放完 ${audios.length} 段`;
          break;
        case "error":
          button.textContent = "重试连续播放";
          status.textContent = `第 ${position} 段加载失败`;
          break;
        default:
          button.textContent = `连续播放 ${audios.length} 段`;
          status.textContent = `共 ${audios.length} 段音频`;
      }
    };

    const pauseOtherAudios = (activeAudio) => {
      audios.forEach((audio) => {
        if (audio === activeAudio || audio.paused) return;
        suppressedPauses.add(audio);
        audio.pause();
      });
    };

    const playAudio = (index, scrollIntoView = false) => {
      const audio = audios[index];
      if (!audio) return;

      currentIndex = index;
      pauseOtherAudios(audio);

      if (scrollIntoView) {
        audio.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
        });
      }

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          sequenceActive = false;
          setUi("error", index);
        });
      }
    };

    button.addEventListener("click", () => {
      const currentAudio = audios[currentIndex] || audios[0];

      if (sequenceActive) {
        if (!currentAudio.paused) {
          pausedFromButton = true;
          currentAudio.pause();
        } else {
          playAudio(currentIndex);
        }
        return;
      }

      const resumableIndex = audios.findIndex(
        (audio) => audio.currentTime > 0 && !audio.ended
      );
      currentIndex = resumableIndex >= 0 ? resumableIndex : 0;

      if (audios.every((audio) => audio.ended)) {
        audios.forEach((audio) => {
          audio.currentTime = 0;
        });
        currentIndex = 0;
      }

      sequenceActive = true;
      playAudio(currentIndex);
    });

    audios.forEach((audio, index) => {
      audio.addEventListener("play", () => {
        pauseOtherAudios(audio);
        currentIndex = index;
        setUi(sequenceActive ? "playing" : "manual", index);
      });

      audio.addEventListener("pause", () => {
        if (suppressedPauses.has(audio)) {
          suppressedPauses.delete(audio);
          return;
        }
        if (audio.ended) return;

        currentIndex = index;
        if (pausedFromButton) {
          pausedFromButton = false;
          setUi("paused", index);
        } else {
          sequenceActive = false;
          setUi("stopped", index);
        }
      });

      audio.addEventListener("ended", () => {
        currentIndex = index;
        if (!sequenceActive) {
          setUi("idle", index);
          return;
        }

        const nextIndex = index + 1;
        if (nextIndex < audios.length) {
          playAudio(nextIndex, true);
        } else {
          sequenceActive = false;
          setUi("complete", index);
        }
      });

      audio.addEventListener("error", () => {
        if (currentIndex !== index || !sequenceActive) return;
        sequenceActive = false;
        setUi("error", index);
      });
    });

    setUi("idle", 0);
  });
})();
