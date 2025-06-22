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
  const folder = event.queryStringParameters?.folder;
  const file = event.queryStringParameters?.file;

  if (!file || !folder) {
    return {
      statusCode: 400,
      body: 'Missing "folder" or "file" parameter',
    };
  }

  const key = `${decodeURIComponent(folder)}/${decodeURIComponent(file)}`;

  try {
    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: bucketName,
      Key: key,
      Expires: 60, // valid for 60 seconds
    });

    return {
      statusCode: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "no-cache",
      },
    };
  } catch (err) {
    console.error("Error generating signed URL", err);
    return {
      statusCode: 500,
      body: "Error generating signed URL: " + err.message,
    };
  }
};
