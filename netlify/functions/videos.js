const { S3 } = require("aws-sdk");

const s3 = new S3({
  accessKeyId: process.env.OSS_KEY,
  secretAccessKey: process.env.OSS_SECRET,
  endpoint: process.env.OSS_ENDPOINT,
  region: process.env.OSS_REGION,
  signatureVersion: "v4",
});

const bucketName = process.env.OSS_BUCKET;

exports.handler = async () => {
  try {
    // 1. List objects under videos/
    const list = await s3.listObjectsV2({
      Bucket: bucketName,
      Prefix: "videos/",
    }).promise();

    if (!list.Contents) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    // 2. Filter mp4 + generate signed URLs
    const videos = list.Contents
      .filter(obj => obj.Key.endsWith(".mp4"))
      .map(obj => {
        const url = s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: obj.Key,
          Expires: 300,
        });

        return {
          name: obj.Key.replace("videos/", ""),
          url,
          lastModified: obj.LastModified,
        };
      });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(videos),
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: err.message,
    };
  }
};
