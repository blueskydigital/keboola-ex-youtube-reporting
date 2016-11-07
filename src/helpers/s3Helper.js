import fs from 'fs';
import path from 'path';

/**
 * This function iterates over file names and calls the function for actual data upload.
 */
export function uploadFilesOnS3(AWS, sourceDir, files, bucketName, remotePath) {
  return files.map(file => uploadFile(AWS, sourceDir, file, bucketName, remotePath));
}

/**
 * This function does the actual file upload.
 */
export function uploadFile(AWS, sourceDir, file, bucketName, remotePath) {
  return new Promise((resolve, reject) => {
    const bucket = path.join(bucketName, remotePath);
    const s3 = new AWS.S3({ params: { Bucket: bucket, Key: file }});
    const body = fs.createReadStream(path.join(sourceDir, file));
    s3.upload({ Body: body })
      .send((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(`${file} uploaded successfully!`);
        }
      });
  });
}
