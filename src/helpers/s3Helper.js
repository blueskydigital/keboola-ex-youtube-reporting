import fs from 'fs';
import path from 'path';
import { take, last, first } from 'lodash';

/**
 * This function iterates over file names and calls the function for actual data upload.
 */
export function uploadFilesOnS3(AWS, sourceDir, files, bucketName, remotePath, byCreatedDate) {
  return files.map(file => {
    const metadata = file.split('|');
    const reportType = first(metadata);
    const key = byCreatedDate
      ? `${file}`
      : `${take(metadata, 2).join('_')}.csv`;
    return uploadFile(AWS, sourceDir, file, bucketName, `${remotePath}/${reportType}`, key);
  });
}

/**
 * This function does the actual file upload.
 */
export function uploadFile(AWS, sourceDir, file, bucketName, remotePath, key) {
  return new Promise((resolve, reject) => {
    const bucket = path.join(bucketName, remotePath);
    const s3 = new AWS.S3({ params: { Bucket: bucket, Key: key }});
    const body = fs.createReadStream(path.join(sourceDir, file));
    s3.upload({ Body: body })
      .send(error => {
        if (error) {
          reject(error);
        } else {
          resolve(`${file} uploaded successfully!`);
        }
      });
  });
}
