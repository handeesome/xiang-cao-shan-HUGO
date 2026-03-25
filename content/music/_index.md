---
title: 诗歌
booktoc: false
---

# 诗歌

<div id="music-app"></div>

<div class="music-filters">
  <label>
    排序:
    <div class="select-wrap">
      <select id="musicSort">
        <option value="numeric">默认（编号）</option>
        <option value="title">按标题</option>
      </select>
    </div>
  </label>
</div>

<style>
.music-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin: 1rem 0;
}

.music-filters label {
  font-size: 0.9rem;
  opacity: 0.9;
}

.music-filters select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding: 0.45rem 0.9rem;
  padding-right: 2rem;
  font-size: 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--gray-200);
  background: var(--body-background, #fff);
  color: inherit;
  cursor: pointer;
  transition: border 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}

.music-filters .select-wrap {
  position: relative;
}

.music-filters .select-wrap::after {
  content: "▾";
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-size: 0.8rem;
  opacity: 0.7;
}

.music-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
}

.music-card {
  border: 1px solid var(--gray-200);
  border-radius: 14px;
  background: transparent;
  overflow: hidden;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}

.music-card a {
  display: flex;
  flex-direction: column;
  height: 100%;
  text-decoration: none;
  color: inherit;
}

.music-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-link);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.08);
}

.music-card:hover img {
  transform: scale(1.02);
}

.music-card a:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-link) 22%, transparent);
}

.music-card img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--gray-100);
  transition: transform 0.12s ease, filter 0.25s ease;
}

.music-thumb {
  position: relative;
}

/* optional play overlay */
.music-thumb::after {
  content: "▶";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: var(--body-font-color);
  text-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.music-thumb-img.is-loading {
  filter: blur(10px) saturate(0.9);
  transform: scale(1.01);
}

.music-title {
  padding: 0.75rem 0.9rem 1rem;
  font-size: 0.95rem;
  text-align: center;
}

.music-title .duration {
  display: block;
  font-size: 0.8rem;
  margin-top: 0.35rem;
  opacity: 0.7;
}

@keyframes musicShimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.music-skeleton {
  background: linear-gradient(
    90deg,
    var(--gray-100),
    var(--gray-200),
    var(--gray-100)
  );
  background-size: 200% 100%;
  animation: musicShimmer 1.25s ease-in-out infinite;
}

.music-skeleton-card {
  border: 1px solid var(--gray-200);
  border-radius: 14px;
  overflow: hidden;
  background: transparent;
}

.music-skeleton-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.music-skeleton-line {
  height: 0.9rem;
  border-radius: 999px;
}

@media (prefers-reduced-motion: reduce) {
  .music-skeleton {
    animation: none;
  }
}
</style>

<script>

  const OSS_JSON = "https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/music/videos.json"

  const params = new URLSearchParams(location.search)
  const currentVideo = params.get("v")
  const currentFolder = params.get("folder") || ""

  const formatDuration = s => {
    if (!s) return "--:--"
    const m = Math.floor(s/60)
    const sec = Math.floor(s%60).toString().padStart(2,"0")
    return `${m}:${sec}`
  }

  async function main(){

    const app = document.getElementById("music-app")

    const placeholderImg = "/img/video-placeholder.jpg"
    const musicSort = document.getElementById("musicSort")

    if(currentVideo){
      document.querySelector(".music-filters")?.remove()
    }

    function renderSkeleton(count = 12){
      return `
        <div class="music-grid">
          ${Array.from({length: count}).map(() => `
            <div class="music-skeleton-card">
              <div class="music-skeleton music-skeleton-thumb"></div>
              <div style="padding: 0.75rem 0.9rem 1rem;">
                <div class="music-skeleton music-skeleton-line" style="width: 70%; height: 0.95rem;"></div>
                <div class="music-skeleton music-skeleton-line" style="width: 45%; height: 0.8rem; margin-top: 0.5rem;"></div>
              </div>
            </div>
          `).join("")}
        </div>
      `
    }

    app.innerHTML = renderSkeleton()

    const res = await fetch(OSS_JSON)
    const videos = await res.json()

    videos.sort((a,b)=> new Date(b.lastModified) - new Date(a.lastModified))

    // -------------------------
    // VIDEO PAGE
    // -------------------------

    if(currentVideo){

      const video = videos.find(v => v.name === currentVideo)

      if(!video){
        app.innerHTML="Video not found"
        return
      }

      const title = video.name.split("/").pop().replace(".mp4","")

      app.innerHTML = `
        <h2>${title}</h2>

        <video controls style="width:100%" preload="metadata">
          <source src="${video.url}">
        </video>

        <p style="margin-top:2rem">
          <a href="/music/?folder=${encodeURIComponent(currentFolder)}">← 返回列表</a>
        </p>
      `

      return
    }

    // -------------------------
    // FOLDER VIEW
    // -------------------------

    const folders = new Set()
    const files = []

    videos
      .filter(v => v.name.startsWith(currentFolder))
      .forEach(v => {
        const rest = v.name.slice(currentFolder.length)
        const parts = rest.split("/").filter(Boolean)

        if(parts.length === 1){
          files.push(v)
        } else {
          folders.add(parts[0])
        }

      })

    const getNum = n=>{
      const m = n.match(/^\d+/)
      return m ? parseInt(m[0]) : null
    }

    const getTitle = v => v.name.split("/").pop().replace(".mp4","")

    function sortFiles(list, mode){
      const sortMode = mode || musicSort?.value || "numeric"

      // Title sort (lexicographic, Chinese-friendly)
      if(sortMode === "title"){
        return [...list].sort((a,b)=> getTitle(a).localeCompare(getTitle(b),'zh'))
      }

      // Default: numeric by leading number, fallback to title
      return [...list].sort((a,b)=>{
        const aName = a.name.split("/").pop()
        const bName = b.name.split("/").pop()

        const aNum = getNum(aName)
        const bNum = getNum(bName)

        if(aNum !== null && bNum !== null) return aNum - bNum
        if(aNum !== null) return -1
        if(bNum !== null) return 1

        return aName.localeCompare(bName,'zh')
      })
    }

    function renderFolder(){
      app.innerHTML = ""

      // -------------------------
      // BREADCRUMB
      // -------------------------
      if(currentFolder){

        const seg = currentFolder.split("/").filter(Boolean)
        const parent = seg.slice(0,-1).join("/")
        const parentFolder = parent ? parent+"/" : ""

        const crumb = document.createElement("p")

        crumb.innerHTML = `
          <a href="/music/">总目录</a>
          / <a href="/music/?folder=${encodeURIComponent(parentFolder)}">返回上级</a>
        `

        app.appendChild(crumb)
      }

      const grid = document.createElement("div")
      grid.className = "music-grid"

      // -------------------------
      // RENDER FOLDERS
      // -------------------------
      folders.forEach(folder => {
        const card = document.createElement("div")
        card.className = "music-card"

        card.innerHTML = `
          <a href="/music/?folder=${encodeURIComponent(currentFolder+folder+"/")}">
            <img
              src="/img/folder-placeholder.jpg"
              alt="${folder}"
              loading="lazy"
              decoding="async"
            >
            <div class="music-title">📁 ${folder}</div>
          </a>
        `

        grid.appendChild(card)
      })

      // -------------------------
      // RENDER FILES
      // -------------------------
      const sortedFiles = sortFiles(files)
      sortedFiles.forEach(v => {
        const title = getTitle(v)
        const card = document.createElement("div")
        card.className="music-card"
        const thumb = v.url + "?x-oss-process=video/snapshot,t_0,f_jpg,w_320";

        card.innerHTML = `
          <a href="/music/?v=${encodeURIComponent(v.name)}&folder=${encodeURIComponent(currentFolder)}">

            <div class="music-thumb">
              <img
                src="${placeholderImg}"
                data-src="${thumb || placeholderImg}"
                class="music-thumb-img is-loading"
                alt="${title}"
                loading="lazy"
                decoding="async"
              >
            </div>

            <div class="music-title">
              ${title}
              <div class="duration">${formatDuration(v.duration)}</div>
            </div>

          </a>
        `

        grid.appendChild(card)
      })

      app.appendChild(grid)

      // -------------------------
      // LAZY LOAD THUMBNAILS (blur until loaded)
      // -------------------------
      const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if(!e.isIntersecting) return

          const img = e.target
          const realSrc = img.dataset.src
          if(!realSrc) return

          img.onload = () => {
            img.classList.remove("is-loading")
            observer.unobserve(img)
          }

          img.onerror = () => {
            img.src = placeholderImg
            img.classList.remove("is-loading")
            observer.unobserve(img)
          }

          img.src = realSrc
        })
      },{rootMargin:"200px"})

      document.querySelectorAll("img[data-src]").forEach(img => observer.observe(img))
    }

    renderFolder()
    if(musicSort){
      musicSort.addEventListener("change", renderFolder)
    }

  }

  main()

</script>