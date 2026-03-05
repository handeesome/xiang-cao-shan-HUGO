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
          <img src="/img/folder-placeholder.jpg">
          <div class="music-title">📁 ${folder}</div>
        </a>
      `

      grid.appendChild(card)

    })

    // -------------------------
    // RENDER FILES
    // -------------------------

    files.forEach(v => {

      const title = v.name.split("/").pop().replace(".mp4","")

      const card = document.createElement("div")
      card.className="music-card"

      card.innerHTML = `
        <a href="/music/?v=${encodeURIComponent(v.name)}&folder=${encodeURIComponent(currentFolder)}">

          <div class="music-thumb">
            <img data-src="${v.thumb || '/img/video-placeholder.jpg'}">
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
    // LAZY LOAD THUMBNAILS
    // -------------------------

    const observer = new IntersectionObserver(entries => {

      entries.forEach(e => {

        if(!e.isIntersecting) return

        const img = e.target
        img.src = img.dataset.src

        img.onerror = () => img.src="/img/video-placeholder.jpg"

        observer.unobserve(img)

      })

    },{rootMargin:"200px"})

    document.querySelectorAll("img[data-src]").forEach(img => observer.observe(img))

  }

  main()

</script>