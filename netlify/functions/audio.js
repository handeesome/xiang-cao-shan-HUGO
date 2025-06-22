const { S3 } = require("aws-sdk");

const s3 = new S3({
  accessKeyId: process.env.OSS_KEY,
  secretAccessKey: process.env.OSS_SECRET,
  endpoint: process.env.OSS_ENDPOINT,
  region: process.env.OSS_REGION,
  signatureVersion: "v4",
});

const bucketName = process.env.OSS_BUCKET;

exports.handler = async (event) => {
  const file = event.queryStringParameters?.file;

  if (!file) {
    return {
      statusCode: 400,
      body: 'Missing "file" parameter',
    };
  }

  // Extract path name from the request path
  const path = event.path;
  const match = path.match(/\/([^/]+)$/);
  const folder = match ? decodeURIComponent(match[1]) : "";

  if (!folder) {
    return {
      statusCode: 400,
      body: "Missing folder name in function path",
    };
  }

  const objectKey = `${folder}/${file}`;

  try {
    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: bucketName,
      Key: objectKey,
      Expires: 60,
    });

    return {
      statusCode: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "no-cache",
      },
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: "Error generating signed URL: " + err.message,
    };
  }
};
