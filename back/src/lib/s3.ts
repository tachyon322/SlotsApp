import { S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT || "https://s3.spb.sprinthost.ru";
const region = process.env.S3_REGION || "spb";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || "";
const bucket = process.env.S3_BUCKET || "s3-961728";

if (!accessKeyId || !secretAccessKey) {
  console.warn("[S3] S3 credentials not set — presign will fail. Set S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY");
}

export const s3Client = new S3Client({
  region,
  endpoint,
  credentials:
    accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
  forcePathStyle: true,
});

export function getS3Bucket(): string {
  return bucket;
}

export function getS3Endpoint(): string {
  return endpoint.replace(/\/$/, "");
}

export function getS3PublicUrl(key: string): string {
  const ep = getS3Endpoint();
  const b = getS3Bucket();
  const cleanKey = key.replace(/^\//, "");
  return `${ep}/${b}/${cleanKey}`;
}
