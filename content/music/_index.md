---
title: 诗歌
booktoc: false
---

# 诗歌

<div id="music-app"></div>

<style>
.music-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(200px,1fr));
  gap: 1rem;
}

.music-card {
  cursor: pointer;
}

.music-card img {
  width: 100%;
  border-radius: 6px;
  background: #eee;
}

.music-title {
  margin-top: .4rem;
  font-size: .9rem;
  text-align: center;
}

/* optional play overlay */
.music-thumb {
  position: relative;
}

.music-thumb::after {
  content: "▶";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: white;
  text-shadow: 0 0 10px black;
  pointer-events: none;
}
</style>

<script>
const params = new URLSearchParams(location.search);
const currentVideo = params.get("v");

fetch("/.netlify/functions/video/music")
.then(r => r.json())
.then(videos => {

  const app = document.getElementById("music-app");

  videos.sort((a,b)=> new Date(b.lastModified) - new Date(a.lastModified));

  // =========================
  // SINGLE VIDEO VIEW
  // =========================
  if (currentVideo) {

    const video = videos.find(v => v.name === currentVideo);

    if (!video) {
      app.innerHTML = "<p>Video not found.</p>";
      return;
    }

    app.innerHTML = `
      <h2>${video.name.replace(".mp4","")}</h2>

      <video controls preload="metadata" style="width:100%">
        <source src="${video.url}">
      </video>

      <p style="margin-top:2rem">
        <a href="/music/">← 返回列表</a>
      </p>
    `;

    return;
  }

  // =========================
  // LIST VIEW
  // =========================
  const grid = document.createElement("div");
  grid.className = "music-grid";

  videos.forEach(v => {

    const safeName = encodeURIComponent(v.name);
    const title = v.name.replace(".mp4","");

    const card = document.createElement("div");
    card.className = "music-card";

    card.innerHTML = `
      <a href="/music/?v=${safeName}">
        <div class="music-thumb">
          <img
            data-src="${v.thumb || '/img/video-placeholder.jpg'}"
            alt="${title}">
        </div>
        <div class="music-title">${title}</div>
      </a>
    `;

    grid.appendChild(card);
  });

  app.appendChild(grid);

  // =========================
  // LAZY LOAD + FALLBACK
  // =========================
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const img = e.target;
        img.src = img.dataset.src;

        // thumbnail fallback
        img.onerror = () => {
          img.src = "/img/video-placeholder.png";
        };

        observer.unobserve(img);
      }
    });
  }, { rootMargin: "200px" });

  document.querySelectorAll("img[data-src]").forEach(img => observer.observe(img));

});
</script>
