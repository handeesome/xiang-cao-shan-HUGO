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
  const folder = event.path.split("/").pop();

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

    const mp4Objects = list.Contents.filter(obj =>
      obj.Key.endsWith(".mp4")
    );

    const videos = await Promise.all(
      mp4Objects.map(async (obj) => {

        const filename = obj.Key.split("/").pop();
        let duration = null;
        // 🔵 Read metadata
        try {
          const head = await s3.headObject({
            Bucket: bucketName,
            Key: obj.Key,
          }).promise();

          duration = head.Metadata?.duration
            ? parseInt(head.Metadata.duration)
            : null;

        } catch {}

        const signedUrl = s3.getSignedUrl("getObject", {
          Bucket: bucketName,
          Key: obj.Key,
          Expires: 300,
        });
        const thumbKey = obj.Key
          .replace(".mp4", ".jpg")
          .replace(/([^/]+)\.jpg$/, "thumb/$1.jpg");

        const thumbUrl = `https://${bucketName}.${process.env.OSS_ENDPOINT.replace("https://","")}/${thumbKey}`;

        return {
          name: filename,
          url: signedUrl,
          duration: duration, // seconds
          thumb: thumbUrl,
          lastModified: obj.LastModified,
        };
      })
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