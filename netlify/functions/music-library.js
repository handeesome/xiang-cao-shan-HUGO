const OSS_JSON_URL =
  "https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/music/videos.json";

// Keep this in sync with the frontend pageSize.
const DEFAULT_PAGE_SIZE = 40;

// Cache the OSS manifest in-memory to avoid fetching on every request.
const CACHE_TTL_MS = 60 * 1000;
let cachedVideos = null;
let cachedAtMs = 0;
const ENABLE_LOGGING = String(process.env.MUSIC_LIBRARY_LOGGING || "") === "1";

function getLeadingNum(name) {
  const m = String(name).match(/^\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function getTitleFromName(videoName) {
  return String(videoName).split("/").pop().replace(/\.mp4$/i, "");
}

function sortFilesNumeric(list, sortMode) {
  if (sortMode === "title") {
    return [...list].sort((a, b) =>
      getTitleFromName(a.name).localeCompare(getTitleFromName(b.name), "zh")
    );
  }

  return [...list].sort((a, b) => {
    const aName = String(a.name).split("/").pop();
    const bName = String(b.name).split("/").pop();

    const aNum = getLeadingNum(aName);
    const bNum = getLeadingNum(bName);

    if (aNum !== null && bNum !== null) return aNum - bNum;
    if (aNum !== null) return -1;
    if (bNum !== null) return 1;
    return aName.localeCompare(bName, "zh");
  });
}

function normalizeFolder(prefix) {
  const p = String(prefix || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, ""); // remove trailing slashes

  if (!p) return "";
  return `${p}/`; // add trailing slash for safe startsWith checks
}

async function getVideos() {
  const nowMs = Date.now();
  if (cachedVideos && nowMs - cachedAtMs < CACHE_TTL_MS) return cachedVideos;

  const res = await fetch(OSS_JSON_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch videos.json: HTTP ${res.status}`);
  }

  const videos = await res.json();

  // Match the previous client/generator behavior: sort by lastModified first
  // so folder insertion order is stable.
  videos.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  cachedVideos = videos;
  cachedAtMs = nowMs;
  return cachedVideos;
}

exports.handler = async (event) => {
  const t0 = Date.now();
  try {
    const qs = event.queryStringParameters || {};
    const folderPrefix = normalizeFolder(qs.folder);
    const sortMode = String(qs.sort || "numeric");

    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(String(qs.pageSize || DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
    );
    const page = Math.max(1, parseInt(String(qs.page || "1"), 10) || 1);

    const videos = await getVideos();

    const folders = [];
    const foldersSeen = new Set();
    const files = [];

    for (const v of videos) {
      const name = String(v.name || "");
      if (folderPrefix) {
        if (!name.startsWith(folderPrefix)) continue;
      }

      const remainder = folderPrefix ? name.slice(folderPrefix.length) : name;
      const parts = remainder.split("/").filter(Boolean);

      if (parts.length === 1) {
        files.push(v);
      } else if (parts.length > 1) {
        const folderName = parts[0];
        if (!foldersSeen.has(folderName)) {
          foldersSeen.add(folderName);
          folders.push(folderName);
        }
      }
    }

    const sortedFiles = sortFilesNumeric(files, sortMode);
    const totalItems = sortedFiles.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    const start = (page - 1) * pageSize;
    const items = sortedFiles.slice(start, start + pageSize).map((it) => ({
      name: it.name,
      url: it.url,
      duration: it.duration,
      lastModified: it.lastModified,
    }));

    const pageInfo = {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasMore: page < totalPages,
    };

    if (ENABLE_LOGGING) {
      const ms = Date.now() - t0;
      // Keep logs short; Netlify will aggregate by request.
      // eslint-disable-next-line no-console
      console.log(
        `[music-library] folder=${folderPrefix || "root"} sort=${sortMode} page=${page}/${totalPages} pageSize=${pageSize} items=${items.length} totalItems=${totalItems} durationMs=${ms}`
      );
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
      body: JSON.stringify({
        folders,
        items,
        pageInfo,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        error: "Failed to load music library",
        details: String(err),
      }),
    };
  }
};

