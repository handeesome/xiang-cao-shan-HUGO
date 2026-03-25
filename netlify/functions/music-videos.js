const VIDEOS_JSON_URL =
  "https://xiangcaoshan.oss-cn-beijing.aliyuncs.com/video/music/videos.json";

exports.handler = async (event) => {
  const origin = event?.headers?.origin || "*";

  try {
    const res = await fetch(VIDEOS_JSON_URL, {
      headers: { Accept: "application/json" },
    });

    const text = await res.text();

    return {
      statusCode: res.status || 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        // Keep it short to avoid staleness during editing.
        "Cache-Control": "public, max-age=60",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": origin,
      },
      body: JSON.stringify({
        error: "Failed to fetch music videos index",
        details: String(err),
      }),
    };
  }
};

