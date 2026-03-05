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
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  const currentFolder = params.get("folder") || "";

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  (async () => {
    const app = document.getElementById("music-app");

    const OSS_BASE = "https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/";
    const folderPath = currentFolder ? currentFolder : "music";
    const res = await fetch(`${OSS_BASE}${folderPath}/videos.json`);
    const videos = await res.json();

    // Sort by lastModified descending
    videos.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // ------------------------
    // SINGLE VIDEO VIEW
    // ------------------------
    if (currentVideo) {
      const video = videos.find(v => v.name === currentVideo);
      if (!video) {
        app.innerHTML = "<p>Video not found.</p>";
        return;
      }
      const title = video.name.split("/").pop().replace(".mp4", "");

      app.innerHTML = `
        <h2>${title}</h2>
        <video controls preload="metadata" style="width:100%">
          <source src="${video.url}">
        </video>
        <p style="margin-top:2rem">
          <a href="/music/">← 返回列表</a>
        </p>
      `;
      return;
    }

    // ------------------------
    // PROCESS FOLDERS & FILES
    // ------------------------
    const folders = {};
    const files = [];

    videos.forEach(v => {
      const parts = v.name.split("/").filter(Boolean);
      if (parts.length === 1) {
        files.push(v);
      } else if (parts.length > 1) {
        folders[parts[0]] = true;
      }
    });

    // ------------------------
    // RENDER BREADCRUMB
    // ------------------------
    if (currentFolder) {
      const segments = currentFolder.split("/").filter(Boolean);
      const parentSegments = segments.slice(0, -1);
      const parentFolder = parentSegments.length ? parentSegments.join("/") + "/" : "";

      const crumb = document.createElement("p");
      crumb.innerHTML = `
        <a href="/music/">总目录</a>
        ${segments.length ? ` / <a href="/music/?folder=${encodeURIComponent(parentFolder)}">返回上级</a>` : ""}
      `;
      app.appendChild(crumb);
    }

    const grid = document.createElement("div");
    grid.className = "music-grid";

    // Render folders
    Object.keys(folders).forEach(folderName => {
      const card = document.createElement("div");
      card.className = "music-card";
      card.innerHTML = `
        <a href="/music/?folder=${encodeURIComponent(folderName + "/")}">
          <img src="/img/folder-placeholder.jpg">
          <div class="music-title">${folderName}</div>
        </a>
      `;
      grid.appendChild(card);
    });

    // Render files
    files.forEach(v => {
      const title = v.name.split("/").pop().replace(".mp4", "");
      const card = document.createElement("div");
      card.className = "music-card";
      card.innerHTML = `
        <a href="/music/?v=${encodeURIComponent(v.name)}">
          <div class="music-thumb">
            <img data-src="${v.thumb || '/img/video-placeholder.jpg'}" alt="${title}">
          </div>
          <div class="music-title">
            ${title}
            <div class="duration">${formatDuration(v.duration)}</div>
          </div>
        </a>
      `;
      grid.appendChild(card);
    });

    app.appendChild(grid);

    // ------------------------
    // LAZY LOAD THUMBNAILS
    // ------------------------
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const img = e.target;
          img.src = img.dataset.src;
          img.onerror = () => img.src = "/img/video-placeholder.jpg";
          observer.unobserve(img);
        }
      });
    }, { rootMargin: "200px" });

    document.querySelectorAll("img[data-src]").forEach(img => observer.observe(img));

  })();
</script>
