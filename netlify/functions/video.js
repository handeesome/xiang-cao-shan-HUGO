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
  console.log("Full path:", event.path);
  console.log("Raw path:", event.rawUrl);
  console.log("Path params:", event.pathParameters);
  console.log("Query params:", event.queryStringParameters);

  const folder = event.path.split("/").pop();
  console.log("Extracted folder:", folder);

  // "music" from /video/music

  if (!folder) {
    return {
      statusCode: 400,
      body: "Missing folder name",
    };
  }

  const PREFIX = `video/${folder}/`;

  try {
    const list = await s3
      .listObjectsV2({
        Bucket: bucketName,
        Prefix: PREFIX,
      })
      .promise();

    if (!list.Contents || list.Contents.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    const videos = list.Contents.filter((obj) => obj.Key.endsWith(".mp4")).map(
      (obj) => {
        const signedUrl = s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: obj.Key,
          Expires: 300,
        });

        return {
          name: obj.Key.replace(PREFIX, ""),
          url: signedUrl,
          lastModified: obj.LastModified,
        };
      },
    );

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
