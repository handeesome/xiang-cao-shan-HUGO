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
    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: bucketName,
      Key: `audio/${file}`, // Adjust if your bucket structure is different
      Expires: 60, // Link expires in 60 seconds
    });
    console.log(signedUrl);

    return {
      statusCode: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "no-cache",
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
