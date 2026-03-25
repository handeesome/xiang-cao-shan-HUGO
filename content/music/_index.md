---
title: 诗歌
booktoc: false
---

# 诗歌


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
<div id="music-app"></div>

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
  content-visibility: auto;
  contain-intrinsic-size: 220px 200px;
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
  color: #adb5bd;
  text-shadow: 0 12px 40px #1f4e78;
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

.music-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin: 1.25rem 0;
}

.music-pagination .page-link {
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--gray-200);
  text-decoration: none;
  color: inherit;
}

.music-pagination .page-link:hover {
  border-color: var(--color-link);
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

  const INDEX_BASE = "/data/music"
  const OSS_PROXY = "/.netlify/functions/music-videos" // fallback
  const MUSIC_PAGE_SIZE = 40 // must match scripts/generate-music-index.mjs

  const VIDEO_BASE =
    "https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/music/"

  const params = new URLSearchParams(location.search)
  const currentVideo = params.get("v")
  const currentFolder = params.get("folder") || ""
  const requestedPage = Math.max(
    1,
    parseInt(params.get("page") || "1", 10)
  )
  const sortModeFromUrl = params.get("sort") || "numeric"

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

    if(currentVideo){
      document.querySelector(".music-filters")?.remove()

      const title = String(currentVideo)
        .split("/").pop()
        .replace(/\.mp4$/i,"")
      const videoUrl = encodeURI(`${VIDEO_BASE}${currentVideo}`)
      const poster = `${videoUrl}?x-oss-process=video/snapshot,t_0,f_jpg,w_320`

      const h2 = document.createElement("h2")
      h2.textContent = title

      const videoEl = document.createElement("video")
      videoEl.controls = true
      videoEl.preload = "metadata"
      videoEl.playsInline = true
      videoEl.style.width = "100%"
      videoEl.poster = poster

      const source = document.createElement("source")
      source.src = videoUrl
      videoEl.appendChild(source)

      const backWrap = document.createElement("p")
      backWrap.style.marginTop = "2rem"

      const backLink = document.createElement("a")
      const backParams = new URLSearchParams()
      backParams.set("folder", currentFolder)
      backParams.set("sort", sortModeFromUrl)
      backParams.set("page", String(requestedPage))
      backLink.href = `/music/?${backParams.toString()}`
      backLink.textContent = "← 返回列表"
      backWrap.appendChild(backLink)

      app.innerHTML = ""
      app.appendChild(h2)
      app.appendChild(videoEl)
      app.appendChild(backWrap)
      return
    }

    // -------------------------
    // FOLDER VIEW (instant; uses pre-generated indices + pagination)
    // -------------------------

    let page = requestedPage
    let sortMode = musicSort?.value || sortModeFromUrl || "numeric"

    function folderKeyFromPrefix(prefix) {
      // Must match scripts/generate-music-index.mjs
      if (!prefix) return "root"
      const cleaned = String(prefix).replace(/^\/+/, "").replace(/\/+$/, "")
      if (!cleaned) return "root"
      return cleaned.replace(/\//g, "__")
    }

    async function fetchJsonCached(url) {
      try {
        if (!("caches" in window)) throw new Error("Cache API unavailable")
        const cache = await caches.open("music-index-v1")
        const cached = await cache.match(url)
        if (cached) return await cached.json()

        const res = await fetch(url, { headers: { Accept: "application/json" } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        cache.put(url, res.clone()).catch(() => {})
        return await res.json()
      } catch (e) {
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      }
    }

    function getTitleFromVideoName(videoName) {
      return String(videoName).split("/").pop().replace(/\.mp4$/i, "")
    }

    function renderPagination({ hasMore, page }) {
      const nav = document.createElement("div")
      nav.className = "music-pagination"

      const curParams = new URLSearchParams()
      if (currentFolder) curParams.set("folder", currentFolder)
      curParams.set("sort", sortMode)

      if (page > 1) {
        const prevA = document.createElement("a")
        prevA.className = "page-link"
        prevA.href = `/music/?${curParams.toString()}&page=${page - 1}`
        prevA.textContent = "← 上一页"
        nav.appendChild(prevA)
      }

      if (hasMore) {
        const nextA = document.createElement("a")
        nextA.className = "page-link"
        nextA.href = `/music/?${curParams.toString()}&page=${page + 1}`
        nextA.textContent = "下一页 →"
        nav.appendChild(nextA)
      }

      return nav
    }

    async function renderFolderPage() {
      app.innerHTML = ""

      // Breadcrumb
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

      const fragment = document.createDocumentFragment()

      const folderKey = folderKeyFromPrefix(currentFolder)
      const folderKeyEnc = encodeURIComponent(folderKey)

      const foldersUrl = `${INDEX_BASE}/${folderKeyEnc}/folders.json`
      const pageUrl = `${INDEX_BASE}/${folderKeyEnc}/files-${sortMode}/page-${page}.json`

      try {
        const [foldersData, filePageData] = await Promise.all([
          fetchJsonCached(foldersUrl),
          fetchJsonCached(pageUrl),
        ])

        ;(foldersData.folders || []).forEach(folder => {
          const card = document.createElement("div")
          card.className = "music-card"

          const a = document.createElement("a")
          a.href = `/music/?folder=${encodeURIComponent(currentFolder + folder + "/")}`

          const img = document.createElement("img")
          img.src = "/img/folder-placeholder.jpg"
          img.width = 320
          img.height = 180
          img.alt = folder
          img.loading = "lazy"
          img.decoding = "async"

          const titleEl = document.createElement("div")
          titleEl.className = "music-title"
          titleEl.textContent = `📁 ${folder}`

          a.appendChild(img)
          a.appendChild(titleEl)
          card.appendChild(a)
          fragment.appendChild(card)
        })

        const items = filePageData.items || []
        items.forEach(v => {
          const title = getTitleFromVideoName(v.name)

          const card = document.createElement("div")
          card.className = "music-card"

          const a = document.createElement("a")
          a.href = `/music/?v=${encodeURIComponent(v.name)}&folder=${encodeURIComponent(
            currentFolder
          )}&sort=${encodeURIComponent(sortMode)}&page=${page}`

          const thumb = `${v.url}?x-oss-process=video/snapshot,t_0,f_jpg,w_320`

          const thumbWrap = document.createElement("div")
          thumbWrap.className = "music-thumb"

          const img = document.createElement("img")
          img.src = placeholderImg
          img.dataset.src = thumb || placeholderImg
          img.className = "music-thumb-img is-loading"
          img.alt = title
          img.width = 320
          img.height = 180
          img.loading = "lazy"
          img.decoding = "async"

          thumbWrap.appendChild(img)

          const titleWrap = document.createElement("div")
          titleWrap.className = "music-title"
          titleWrap.innerHTML = `
            ${title}
            <div class="duration">${formatDuration(v.duration)}</div>
          `

          a.appendChild(thumbWrap)
          a.appendChild(titleWrap)
          card.appendChild(a)
          fragment.appendChild(card)
        })

        grid.appendChild(fragment)
        app.appendChild(grid)

        app.appendChild(
          renderPagination({
            hasMore: Boolean(filePageData.hasMore),
            page,
          })
        )

        // Lazy load thumbnails (blur until loaded), scoped to this page only.
        const observer = new IntersectionObserver(
          entries => {
            entries.forEach(e => {
              if (!e.isIntersecting) return

              const img = e.target
              const realSrc = img.dataset.src
              if (!realSrc) return

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
          },
          { rootMargin: "200px" }
        )

        grid.querySelectorAll("img[data-src]").forEach(img => observer.observe(img))
      } catch (e) {
        // Fallback: old behavior (may be slower, but keeps functionality).
        console.warn("[music-index] Index fetch failed, fallback to OSS:", e)
        const res = await fetch(OSS_PROXY)
        const videos = await res.json()
        videos.sort((a,b)=> new Date(b.lastModified) - new Date(a.lastModified))

        const folders = new Set()
        const files = []
        videos
          .filter(v => v.name.startsWith(currentFolder))
          .forEach(v => {
            const rest = v.name.slice(currentFolder.length)
            const parts = rest.split("/").filter(Boolean)
            if(parts.length === 1) files.push(v)
            else folders.add(parts[0])
          })

        const getNum = n=>{
          const m = n.match(/^\d+/)
          return m ? parseInt(m[0], 10) : null
        }

        const sortFiles = list => {
          if(sortMode === "title"){
            return [...list].sort((a,b)=> getTitleFromVideoName(a.name).localeCompare(getTitleFromVideoName(b.name),'zh'))
          }
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

        const sortedFiles = sortFiles(files)
        const start = (page - 1) * MUSIC_PAGE_SIZE
        const items = sortedFiles.slice(start, start + MUSIC_PAGE_SIZE)
        const hasMore = start + MUSIC_PAGE_SIZE < sortedFiles.length

        ;[...folders].forEach(folder => {
          const card = document.createElement("div")
          card.className = "music-card"
          card.innerHTML = `
            <a href="/music/?folder=${encodeURIComponent(currentFolder + folder + "/")}">
              <img
                src="/img/folder-placeholder.jpg"
                width="320"
                height="180"
                alt="${folder}"
                loading="lazy"
                decoding="async"
              >
              <div class="music-title">📁 ${folder}</div>
            </a>
          `
          fragment.appendChild(card)
        })

        items.forEach(v => {
          const title = getTitleFromVideoName(v.name)
          const thumb = `${v.url}?x-oss-process=video/snapshot,t_0,f_jpg,w_320`
          const card = document.createElement("div")
          card.className = "music-card"
          card.innerHTML = `
            <a href="/music/?v=${encodeURIComponent(v.name)}&folder=${encodeURIComponent(currentFolder)}&sort=${encodeURIComponent(
              sortMode
            )}&page=${page}">
              <div class="music-thumb">
                <img
                  src="${placeholderImg}"
                  data-src="${thumb || placeholderImg}"
                  class="music-thumb-img is-loading"
                  alt="${title}"
                  width="320"
                  height="180"
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
          fragment.appendChild(card)
        })

        grid.appendChild(fragment)
        app.appendChild(grid)
        app.appendChild(renderPagination({ hasMore, page }))

        const observer = new IntersectionObserver(
          entries => {
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
          },
          { rootMargin: "200px" }
        )
        grid.querySelectorAll("img[data-src]").forEach(img => observer.observe(img))
      }
    }

    if(musicSort){
      musicSort.value = sortMode
      musicSort.addEventListener("change", async () => {
        sortMode = musicSort.value || "numeric"
        // Keep current folder; reset pagination.
        const url = new URL(location.href)
        url.searchParams.set("sort", sortMode)
        url.searchParams.set("page", "1")
        history.replaceState({}, "", url)
        page = 1
        await renderFolderPage()
      })
    }

    await renderFolderPage()
    return

    const res = await fetch(OSS_PROXY)
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