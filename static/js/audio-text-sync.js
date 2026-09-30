(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const syncedAudios = Array.from(
      document.querySelectorAll("audio[data-sync-src]")
    );
    if (!syncedAudios.length) return;

    let activeController = null;

    const normalizeText = (value) =>
      value
        .normalize("NFKC")
        .replaceAll("神", "上帝")
        .toLowerCase()
        .replace(/[^\p{Script=Han}a-z0-9]/gu, "");

    const createController = async (audio) => {
      const article = audio.closest(".book-article");
      const syncSource = audio.dataset.syncSrc;
      if (!article || !syncSource) return null;

      const response = await fetch(syncSource);
      if (!response.ok) {
        throw new Error(`同步数据加载失败：${response.status}`);
      }

      const data = await response.json();
      const candidates = Array.from(
        article.querySelectorAll("h1, h2, h3, p, li")
      ).map((element) => ({
        element,
        text: normalizeText(element.textContent || ""),
      }));

      const cues = data.cues
        .map((cue) => {
          const target = normalizeText(cue.targetText || "");
          const indexedMatch = Number.isInteger(cue.targetIndex)
            ? candidates[cue.targetIndex]
            : null;
          const match = indexedMatch?.text.startsWith(target)
            ? indexedMatch
            : candidates.find(({ text }) => text.startsWith(target));
          return match ? { ...cue, element: match.element } : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.start - right.start);

      if (!cues.length) return null;

      let activeCue = null;

      const clear = () => {
        activeCue?.element.classList.remove("audio-sync-active");
        activeCue = null;
      };

      const update = () => {
        const currentTime = audio.currentTime;
        let nextCue = null;

        for (const cue of cues) {
          if (cue.start > currentTime) break;
          if (currentTime < cue.end) nextCue = cue;
        }

        if (nextCue === activeCue) return;
        clear();
        activeCue = nextCue;
        activeCue?.element.classList.add("audio-sync-active");
      };

      const controller = { audio, clear, update };

      audio.addEventListener("play", () => {
        if (activeController && activeController !== controller) {
          activeController.clear();
        }
        activeController = controller;
        update();
      });
      ["timeupdate", "seeking", "seeked"].forEach((eventName) => {
        audio.addEventListener(eventName, update);
      });
      audio.addEventListener("ended", clear);
      audio.addEventListener("emptied", clear);

      update();
      return controller;
    };

    syncedAudios.forEach((audio) => {
      createController(audio).catch((error) => {
        console.warn("Audio text sync unavailable", error);
      });
    });
  });
})();
