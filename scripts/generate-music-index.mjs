import fs from "fs/promises";
import path from "path";

const OSS_JSON_URL =
  "https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/music/videos.json";

const PAGE_SIZE = Number(process.env.MUSIC_PAGE_SIZE || 40);

const INDEX_BASE = path.join(
  process.cwd(),
  "static",
  "data",
  "music"
);

function folderKeyFromPrefix(prefix) {
  // `prefix` is like "" or "a/b/" (trailing slash when non-empty).
  if (!prefix) return "root";
  const cleaned = String(prefix).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!cleaned) return "root";
  return cleaned.replace(/\//g, "__");
}

function getTitleFromName(videoName) {
  return String(videoName).split("/").pop().replace(/\.mp4$/i, "");
}

function getLeadingNum(name) {
  const m = String(name).match(/^\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function sortFilesNumeric(list, musicSort) {
  // Keep logic aligned with the previous client implementation.
  const sortMode = musicSort || "numeric";
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

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data), "utf8");
}

async function main() {
  console.log("[music-index] Fetching OSS manifest...");
  const res = await fetch(OSS_JSON_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch videos.json: ${res.status}`);
  const videos = await res.json();

  // This matches the previous client behavior: sort by lastModified first so
  // folder Set insertion order is stable across sessions.
  videos.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  // Map<prefix, { folders: string[], files: video[] }>
  const map = new Map();

  function getBucket(prefix) {
    if (map.has(prefix)) return map.get(prefix);
    const bucket = {
      folders: [],
      _foldersSeen: new Set(),
      files: [],
    };
    map.set(prefix, bucket);
    return bucket;
  }

  // For each video, populate all prefixes where it is either a direct folder
  // child or a direct file child (mirrors the previous filtering logic).
  for (const v of videos) {
    const name = String(v.name);
    const parts = name.split("/").filter(Boolean);
    const L = parts.length;

    for (let k = 0; k <= L - 1; k++) {
      const prefix =
        k === 0 ? "" : `${parts.slice(0, k).join("/")}/`; // trailing slash for non-root
      const restParts = parts.slice(k);

      const bucket = getBucket(prefix);
      if (restParts.length === 1) {
        bucket.files.push(v);
      } else {
        const folderName = restParts[0];
        if (!bucket._foldersSeen.has(folderName)) {
          bucket._foldersSeen.add(folderName);
          bucket.folders.push(folderName);
        }
      }
    }
  }

  console.log(
    `[music-index] Unique prefixes: ${map.size}. Generating index (pageSize=${PAGE_SIZE})...`
  );

  // Clean output dir (best-effort).
  await fs.rm(INDEX_BASE, { recursive: true, force: true });
  await fs.mkdir(INDEX_BASE, { recursive: true });

  const modes = ["numeric", "title"];
  for (const [prefix, bucket] of map.entries()) {
    const folderKey = folderKeyFromPrefix(prefix);

    // folders.json: always same regardless of sort mode
    await writeJson(path.join(INDEX_BASE, folderKey, "folders.json"), {
      folders: bucket.folders,
    });

    for (const mode of modes) {
      const sortedFiles = sortFilesNumeric(bucket.files, mode);
      const total = sortedFiles.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      for (let page = 1; page <= totalPages; page++) {
        const start = (page - 1) * PAGE_SIZE;
        const items = sortedFiles.slice(start, start + PAGE_SIZE);
        const hasMore = page < totalPages;

        await writeJson(
          path.join(
            INDEX_BASE,
            folderKey,
            `files-${mode}`,
            `page-${page}.json`
          ),
          {
            page,
            pageSize: PAGE_SIZE,
            totalItems: total,
            totalPages,
            hasMore,
            items: items.map((it) => ({
              name: it.name,
              url: it.url,
              duration: it.duration,
              lastModified: it.lastModified,
            })),
          }
        );
      }
    }
  }

  console.log("[music-index] Done.");
}

main().catch((err) => {
  console.error("[music-index] Failed:", err);
  process.exit(1);
});

