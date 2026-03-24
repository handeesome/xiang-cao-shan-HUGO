// static/js/audio-play-all.js
(function () {
    function tryPlay(el) {
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  
    document.addEventListener("DOMContentLoaded", () => {
      const audios = Array.from(document.querySelectorAll("audio"));
      if (audios.length === 0) return;
  
      const btn = document.createElement("button");
      btn.className = "play-all-button";
      btn.type = "button";
      btn.textContent = "播放全部";
  
      const first = audios[0];
      first.parentNode?.insertBefore(btn, first);
  
      let autoMode = false;
  
      btn.addEventListener("click", () => {
        autoMode = true;
        tryPlay(first);
      });
  
      // stop chain when user manually pauses/seeks
      audios.forEach((audio, i) => {
        audio.addEventListener("pause", () => {
          if (!audio.ended) autoMode = false;
        });
  
        audio.addEventListener("ended", () => {
          if (!autoMode) return;
          const next = audios[i + 1];
          if (next) tryPlay(next);
        });
      });
    });
  })();