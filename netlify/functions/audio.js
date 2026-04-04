const bucket = process.env.OSS_BUCKET;
const endpointHost = String(process.env.OSS_ENDPOINT || "").replace(/^https?:\/\//, "");

function badRequest() { return { statusCode: 400, body: "Missing book/src" }; }
function forbidden()  { return { statusCode: 403, body: "Invalid path" }; }
function serverError(message) { return { statusCode: 500, body: message }; }

exports.handler = async (event) => {
  if (!bucket || !endpointHost) {
    return serverError("Missing OSS_BUCKET or OSS_ENDPOINT");
  }

  const qs = event.queryStringParameters || {};
  const book = safeDecode(qs.book);
  const src  = safeDecode(qs.src);

  if (!book || !src) return badRequest();

  // deny traversal + normalize slashes
  if (src.includes("..") || book.includes("..") || src.includes("\\") || book.includes("\\")) return forbidden();

  // enforce prefix and join safely (no accidental double slashes)
  const normalizedSrc = src.replace(/^\/+/, "");
  const normalizedBook = book.replace(/^\/+/, "");
  const objectKey = `audio/${normalizedBook}/${normalizedSrc}`.replace(/\/{2,}/g, "/");

  const url = `https://${bucket}.${endpointHost}/${encodeURI(objectKey)}`;
  return { statusCode: 302, headers: { Location: url } };
};

function safeDecode(v) {
  try { return decodeURIComponent(String(v || "")); }
  catch { return ""; }
}
