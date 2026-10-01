(async function () {
  'use strict';

  const MUSIC_API = '/.netlify/functions/music-library';
  const MUSIC_PAGE_SIZE = 40; // must match netlify/functions/music-library.js
  const VIDEO_BASE =
    'https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/music/';

  const app = document.getElementById('music-app');
  if (!app) return;

  const placeholderImg = '/img/video-placeholder.jpg';
  const musicSort = document.getElementById('musicSort');

  const params = new URLSearchParams(location.search);
  const currentVideo = params.get('v');
  const currentFolder = params.get('folder') || '';
  const requestedPage = Math.max(
    1,
    parseInt(params.get('page') || '1', 10) || 1
  );
  let page = requestedPage;
  const sortModeFromUrl = params.get('sort') || 'numeric';

  let sortMode = musicSort?.value || sortModeFromUrl || 'numeric';

  const formatDuration = s => {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${sec}`;
  };

  const getTitleFromVideoName = videoName =>
    String(videoName).split('/').pop().replace(/\.mp4$/i, '');

  function renderSkeleton(count = 12) {
    // Static placeholders only.
    return `
      <div class="music-grid">
        ${Array.from({ length: count })
          .map(
            () => `
          <div class="music-skeleton-card">
            <div class="music-skeleton music-skeleton-thumb"></div>
            <div style="padding: 0.75rem 0.9rem 1rem;">
              <div class="music-skeleton music-skeleton-line" style="width: 70%; height: 0.95rem;"></div>
              <div class="music-skeleton music-skeleton-line" style="width: 45%; height: 0.8rem; margin-top: 0.5rem;"></div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  function renderVideoPage() {
    // Remove filter UI to avoid confusion on the detail view.
    document.querySelector('.music-filters')?.remove();

    const title = getTitleFromVideoName(currentVideo);
    const videoUrl = encodeURI(`${VIDEO_BASE}${currentVideo}`);
    const poster = `${videoUrl}?x-oss-process=video/snapshot,t_0,f_jpg,w_320`;

    app.innerHTML = '';

    const h2 = document.createElement('h2');
    h2.textContent = title;

    const videoEl = document.createElement('video');
    videoEl.controls = true;
    videoEl.preload = 'metadata';
    videoEl.playsInline = true;
    videoEl.style.width = '100%';
    videoEl.poster = poster;

    const source = document.createElement('source');
    source.src = videoUrl;
    videoEl.appendChild(source);

    const backWrap = document.createElement('p');
    backWrap.style.marginTop = '2rem';

    const backLink = document.createElement('a');
    const backParams = new URLSearchParams();
    backParams.set('folder', currentFolder);
    backParams.set('sort', sortMode);
    backParams.set('page', String(page));
    backLink.href = `/music/?${backParams.toString()}`;
    backLink.textContent = '← 返回列表';

    backWrap.appendChild(backLink);

    app.appendChild(h2);
    app.appendChild(videoEl);
    app.appendChild(backWrap);
  }

  const MUSIC_CACHE_NAME = 'music-index-v1';

  async function getCachedJson(url) {
    if (!('caches' in window)) return null;

    try {
      const cache = await caches.open(MUSIC_CACHE_NAME);
      const cached = await cache.match(url);
      return cached ? await cached.json() : null;
    } catch (e) {
      console.warn('[music-index] Failed to read cached music library:', e);
      return null;
    }
  }

  async function fetchJsonAndUpdateCache(url) {
    const res = await fetch(url, {
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if ('caches' in window) {
      const cacheResponse = res.clone();
      caches
        .open(MUSIC_CACHE_NAME)
        .then(cache => cache.put(url, cacheResponse))
        .catch(() => {});
    }

    return await res.json();
  }

  let thumbnailObserver = null;
  let renderSequence = 0;

  function createBreadcrumb() {
    if (!currentFolder) return null;

    const seg = currentFolder.split('/').filter(Boolean);
    const parent = seg.slice(0, -1).join('/');
    const parentFolder = parent ? `${parent}/` : '';

    const crumb = document.createElement('p');

    const totalLink = document.createElement('a');
    totalLink.href = '/music/';
    totalLink.textContent = '总目录';

    const sep = document.createTextNode(' / ');

    const parentLink = document.createElement('a');
    parentLink.href = `/music/?folder=${encodeURIComponent(parentFolder)}`;
    parentLink.textContent = '返回上级';

    crumb.appendChild(totalLink);
    crumb.appendChild(sep);
    crumb.appendChild(parentLink);

    return crumb;
  }

  function renderPagination({ hasMore, page: pageToRender }) {
    const nav = document.createElement('div');
    nav.className = 'music-pagination';

    const curParams = new URLSearchParams();
    if (currentFolder) curParams.set('folder', currentFolder);
    curParams.set('sort', sortMode);

    if (pageToRender > 1) {
      const prevA = document.createElement('a');
      prevA.className = 'page-link';
      prevA.href = `/music/?${curParams.toString()}&page=${pageToRender - 1}`;
      prevA.textContent = '← 上一页';
      nav.appendChild(prevA);
    }

    if (hasMore) {
      const nextA = document.createElement('a');
      nextA.className = 'page-link';
      nextA.href = `/music/?${curParams.toString()}&page=${pageToRender + 1}`;
      nextA.textContent = '下一页 →';
      nav.appendChild(nextA);
    }

    return nav;
  }

  function createMusicStatus(message, state = '') {
    const status = document.createElement('p');
    status.className = 'music-load-status';
    status.setAttribute('role', 'status');
    if (state) status.dataset.state = state;
    status.textContent = message;
    return status;
  }

  function renderLoadingState() {
    app.innerHTML = renderSkeleton();
    app.prepend(createMusicStatus('正在加载音乐…', 'loading'));
  }

  function setMusicStatus(message, state = '') {
    let status = app.querySelector('.music-load-status');
    if (!status) {
      status = createMusicStatus(message, state);
      app.prepend(status);
      return;
    }

    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function clearMusicStatus() {
    app.querySelector('.music-load-status')?.remove();
  }

  function renderMusicData(data, statusMessage = '') {
    app.innerHTML = '';

    // Breadcrumb
    const crumb = createBreadcrumb();
    if (crumb) app.appendChild(crumb);

    if (statusMessage) {
      app.appendChild(createMusicStatus(statusMessage, 'cached'));
    }

    const grid = document.createElement('div');
    grid.className = 'music-grid';

    const fragment = document.createDocumentFragment();

    (data.folders || []).forEach(folder => {
      const card = document.createElement('div');
      card.className = 'music-card';

      const a = document.createElement('a');
      a.href = `/music/?folder=${encodeURIComponent(currentFolder + folder + '/')}`;

      const img = document.createElement('img');
      img.src = '/img/folder-placeholder.jpg';
      img.width = 320;
      img.height = 180;
      img.alt = folder;
      img.loading = 'lazy';
      img.decoding = 'async';

      const titleEl = document.createElement('div');
      titleEl.className = 'music-title';
      titleEl.textContent = `📁 ${folder}`;

      a.appendChild(img);
      a.appendChild(titleEl);
      card.appendChild(a);
      fragment.appendChild(card);
    });

    const items = data.items || [];
    items.forEach(v => {
      const title = getTitleFromVideoName(v.name);

      const card = document.createElement('div');
      card.className = 'music-card';

      const a = document.createElement('a');
      a.href = `/music/?v=${encodeURIComponent(v.name)}&folder=${encodeURIComponent(
        currentFolder
      )}&sort=${encodeURIComponent(sortMode)}&page=${page}`;

      const thumb = `${v.url}?x-oss-process=video/snapshot,t_0,f_jpg,w_320`;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'music-thumb';

      const img = document.createElement('img');
      img.src = placeholderImg;
      img.dataset.src = thumb || placeholderImg;
      img.className = 'music-thumb-img is-loading';
      img.alt = title;
      img.width = 320;
      img.height = 180;
      img.loading = 'lazy';
      img.decoding = 'async';

      thumbWrap.appendChild(img);

      const titleWrap = document.createElement('div');
      titleWrap.className = 'music-title';

      // XSS-safe: OSS-derived titles/folder names become text nodes.
      titleWrap.appendChild(document.createTextNode(title));

      const durationEl = document.createElement('div');
      durationEl.className = 'duration';
      durationEl.textContent = formatDuration(v.duration);
      titleWrap.appendChild(durationEl);

      a.appendChild(thumbWrap);
      a.appendChild(titleWrap);
      card.appendChild(a);
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    app.appendChild(grid);

    app.appendChild(
      renderPagination({
        hasMore: Boolean(data.pageInfo?.hasMore),
        page: data.pageInfo?.page || page,
      })
    );

    // Lazy load thumbnails (blur until loaded).
    if (thumbnailObserver) thumbnailObserver.disconnect();

    thumbnailObserver = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;

          const img = e.target;
          const realSrc = img.dataset.src;
          if (!realSrc) return;

          img.onload = () => {
            img.classList.remove('is-loading');
            thumbnailObserver?.unobserve(img);
          };

          img.onerror = () => {
            img.src = placeholderImg;
            img.classList.remove('is-loading');
            thumbnailObserver?.unobserve(img);
          };

          img.src = realSrc;
        });
      },
      { rootMargin: '200px' }
    );

    grid.querySelectorAll('img[data-src]').forEach(img => {
      thumbnailObserver.observe(img);
    });
  }

  async function renderFolderPage() {
    const sequence = ++renderSequence;
    renderLoadingState();

    const url = `${MUSIC_API}?folder=${encodeURIComponent(
      currentFolder
    )}&sort=${encodeURIComponent(sortMode)}&page=${page}&pageSize=${encodeURIComponent(
      MUSIC_PAGE_SIZE
    )}`;

    const refreshPromise = fetchJsonAndUpdateCache(url).then(
      data => ({ data, error: null }),
      error => ({ data: null, error })
    );
    const cachedData = await getCachedJson(url);
    if (sequence !== renderSequence) return;

    const cachedSnapshot = cachedData ? JSON.stringify(cachedData) : null;
    if (cachedData) {
      renderMusicData(cachedData, '已显示上次加载的内容，正在检查更新…');
    }

    try {
      const refreshResult = await refreshPromise;
      if (refreshResult.error) throw refreshResult.error;

      const freshData = refreshResult.data;
      if (sequence !== renderSequence) return;

      if (!cachedData || JSON.stringify(freshData) !== cachedSnapshot) {
        renderMusicData(freshData);
      } else {
        clearMusicStatus();
      }
    } catch (e) {
      if (sequence !== renderSequence) return;

      console.warn('[music-index] Failed to refresh music library:', e);
      if (cachedData) {
        setMusicStatus('暂时无法更新，当前显示上次加载的内容。', 'warning');
      } else {
        app.innerHTML = '<p class="music-load-status" role="alert">加载失败，请稍后重试。</p>';
      }
    }
  }

  // Main
  app.innerHTML = renderSkeleton();

  if (currentVideo) {
    renderVideoPage();
    return;
  }

  if (musicSort) {
    musicSort.value = sortMode;
    musicSort.addEventListener('change', async () => {
      sortMode = musicSort.value || 'numeric';

      const url = new URL(location.href);
      url.searchParams.set('sort', sortMode);
      url.searchParams.set('page', '1');
      history.replaceState({}, '', url);

      page = 1;
      await renderFolderPage();
    });
  }

  await renderFolderPage();
})();

