(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const syncedAudios = Array.from(
      document.querySelectorAll("audio[data-sync-src]")
    );
    if (!syncedAudios.length) return;

    let activeController = null;
    let activeAudio = null;
    const articleCandidates = new WeakMap();
    const controllers = new WeakMap();
    const pendingControllers = new WeakMap();

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
      let candidates = articleCandidates.get(article);
      if (!candidates) {
        candidates = Array.from(
          article.querySelectorAll("h1, h2, h3, p, li")
        ).map((element) => ({
          element,
          text: normalizeText(element.textContent || ""),
        }));
        articleCandidates.set(article, candidates);
      }

      const cues = data.cues
        .filter((cue) => cue.kind !== "heading")
        .map((cue) => {
          const target = normalizeText(cue.targetText || "");
          const indexedMatch = Number.isInteger(cue.targetIndex)
            ? candidates[cue.targetIndex]
            : null;
          const match = indexedMatch?.text.startsWith(target)
            ? indexedMatch
            : candidates.find(({ text }) => text.startsWith(target));
          return match && !/^H[1-6]$/.test(match.element.tagName)
            ? { ...cue, element: match.element }
            : null;
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

      return { audio, clear, update };
    };

    const prepare = (audio) => {
      if (!pendingControllers.has(audio)) {
        const pending = createController(audio).then((controller) => {
          controllers.set(audio, controller);
          return controller;
        }).catch((error) => {
          // A failed request can be retried on the next interaction.
          pendingControllers.delete(audio);
          console.warn("Audio text sync unavailable", error);
          return null;
        });
        pendingControllers.set(audio, pending);
      }
      return pendingControllers.get(audio);
    };

    const activate = (audio) => {
      const controller = controllers.get(audio);
      if (activeAudio === audio && pendingControllers.has(audio) && !controller) {
        return;
      }
      activeAudio = audio;
      if (activeController && activeController !== controller) {
        activeController.clear();
      }
      activeController = controller || null;
      if (controller) {
        controller.update();
        return;
      }
      prepare(audio).then((ready) => {
        // Loading an earlier segment must not highlight it after a switch.
        if (activeAudio !== audio) return;
        activeController = ready;
        ready?.update();
      });
    };

    syncedAudios.forEach((audio, index) => {
      ["pointerdown", "focus"].forEach((eventName) => {
        audio.addEventListener(eventName, () => prepare(audio));
      });
      audio.addEventListener("play", () => {
        activate(audio);
        const nextAudio = syncedAudios[index + 1];
        if (nextAudio) prepare(nextAudio);
      });
      ["seeking", "seeked"].forEach((eventName) => {
        audio.addEventListener(eventName, () => activate(audio));
      });
      audio.addEventListener("timeupdate", () => {
        if (activeAudio === audio) activeController?.update();
      });
      ["ended", "emptied"].forEach((eventName) => {
        audio.addEventListener(eventName, () => {
          controllers.get(audio)?.clear();
          if (activeAudio !== audio) return;
          activeAudio = null;
          activeController = null;
        });
      });
    });

    // Prepare one segment for prompt initial playback, rather than the whole page.
    activate(syncedAudios[0]);
  });
})();
