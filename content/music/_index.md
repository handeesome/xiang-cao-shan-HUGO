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
  color: white;
  text-shadow: 0 0px 10px black;
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


<script defer src="/js/music-index.js"></script>