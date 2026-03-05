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
      body: 'Missing "file" parameter in query string',
    };
  }

  try {
    const url = `https://${bucketName}.${process.env.OSS_ENDPOINT.replace("https://", "")}/audio/${file}`;

    return {
      statusCode: 302,
      headers: {
        Location: url,
      },
    };
  } catch (err) {
    console.error("Error generating signed URL:", err);
    return {
      statusCode: 500,
      body: "Error generating signed URL: " + err.message,
    };
  }
};
