import AWS from 'aws-sdk';
import path from 'path';
import command from './helpers/cliHelper';
import {
  youtubereporting
} from 'googleapis';
import {
  size
} from 'lodash';
import {
  authorization
} from './helpers/oAuthHelper';
import {
  uploadFilesOnS3
} from './helpers/s3Helper';
import {
  readStateFile,
  createStateFile,
  removeDirectories,
  createTmpDirectory,
  readFilesFromDirectory
} from './helpers/fileHelper';
import {
  getConfig,
  combineStates,
  parseConfiguration,
  generateManifestFiles,
  transformDatesIntoTimestamps,
  prepareMetadataForFileTransfers,
  extractCreateTimesForReportTypes,
  transferFilesFromSourceToDestination,
  getLatestCreatedDateForEachReportType
} from './helpers/keboolaHelper';
import {
  jobsList,
  filterJobsList,
  downloadReports,
  groupReportsByTypes,
  sortReportsForDownload,
  addExtraReportMetadata,
  getNumberOfOldestRecords,
  prepareListOfReportsForDownload,
  extendJobsByAddingCreatedAfterDate
} from './helpers/youtubeHelper';
import {
  JOB_ID,
  IN_DIR,
  OUT_DIR,
  STATE_FILE,
  CONFIG_FILE,
  PRIMARY_KEY,
  KEY_SUFFIXES,
  IS_INCREMENTAL,
  REPORT_TYPE_ID,
  DEFAULT_TABLES_OUT_DIR,
  YOUTUBE_REPORTING_FILES,
  YOUTUBE_REPORTING_FILES_BY_CREATE_TIMES
} from './constants';

/**
 * This is the main part of the program.
 */
(async() => {
  try {
    // Reading of the input configuration.
    const {
      scopes,
      clientId,
      pageSize,
      s3Backup,
      s3Region,
      batchSize,
      tokenType,
      expiryDate,
      remotePath,
      accessToken,
      redirectUrl,
      reportTypes,
      clientSecret,
      refreshToken,
      s3OutputOnly,
      s3BucketName,
      s3AccessKeyId,
      ignoreStateFile,
      initialTimestamp,
      customPrimaryKeys,
      s3SecretAccessKey,
      includeSystemManaged,
      onBehalfOfContentOwner
    } = await parseConfiguration(getConfig(path.join(command.data, CONFIG_FILE)));
    // Prepares the directory for the output.
    const downloadDir = await createTmpDirectory();
    const dataDir = command.data;
    const configInDir = path.join(dataDir, IN_DIR);
    const configOutDir = path.join(dataDir, OUT_DIR);
    const dataOutDir = path.join(dataDir, DEFAULT_TABLES_OUT_DIR);
    const inputState = await readStateFile(configInDir, STATE_FILE);
    // Prepare the youtubeReporting object for data manipulation.
    const youtubeReporting = youtubereporting('v1');
    // The most important part is to authorize
    const auth = authorization({
      clientId, expiryDate, clientSecret, accessToken,
      scopes, refreshToken, tokenType, redirectUrl
    });
    // List of the available jobs.
    const { jobs } = await jobsList({
      auth,
      youtubeReporting,
      includeSystemManaged,
      onBehalfOfContentOwner
    });
    // List of the desired jobs. Will be extended by initial date
    // which indicates the earliest possible download date.
    const filteredJobs = extendJobsByAddingCreatedAfterDate(
      filterJobsList(jobs, reportTypes), inputState, initialTimestamp, ignoreStateFile
    );

    // It makes a sense to continue, only if there is any record in the filteredJobs array.
    if (size(filteredJobs) > 0) {
      // Report list.
      const reportsToDownload = await prepareListOfReportsForDownload({
        auth,
        pageSize,
        youtubeReporting,
        jobs: filteredJobs,
        onBehalfOfContentOwner
      });

      // In this part we are going to group the results by their particular types.
      const reports = getNumberOfOldestRecords(addExtraReportMetadata(
        sortReportsForDownload(groupReportsByTypes(reportsToDownload, JOB_ID)), filteredJobs
      ), batchSize, REPORT_TYPE_ID);

      // Here we are going to download each report and wait until the process is completed.
      const downloadedReports = await downloadReports({
        onBehalfOfContentOwner, youtubeReporting,
        auth, reports, outputDirectory: downloadDir
      });

      // In this step we are going to download names of the files we downloaded in the previous step.
      const downloadedFiles = await readFilesFromDirectory(downloadDir);

      if (!s3OutputOnly) {
        // We also have to prepare the proper metadata for file transfer.
        const fileMetadata = prepareMetadataForFileTransfers(downloadedFiles, downloadDir, dataOutDir);

        // Now it is time to transfer files from the source directory (tmp directory) into destination (table output dir).
        const transferedFiles = await transferFilesFromSourceToDestination(fileMetadata, KEY_SUFFIXES, customPrimaryKeys);

        // We need to create manifests which stores data in Keboola.
        const mergedFiles = await readFilesFromDirectory(dataOutDir);
        const manifests = await Promise.all(generateManifestFiles(mergedFiles, dataOutDir, { incremental: IS_INCREMENTAL, primary_key: PRIMARY_KEY }));
      }

      // This function prepares the data for state.json configuration.
      const outputState = combineStates(inputState, transformDatesIntoTimestamps(
        getLatestCreatedDateForEachReportType(extractCreateTimesForReportTypes(downloadedFiles))
      ));

      // We can backup/store the files on S3 storage.
      if (s3OutputOnly || s3Backup) {
        AWS.config.update({ region: s3Region, accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey });
        const backupFiles = await Promise.all(uploadFilesOnS3(AWS, downloadDir, downloadedFiles, s3BucketName, `${remotePath}/${YOUTUBE_REPORTING_FILES}`, false));
        const fullBackup = await Promise.all(uploadFilesOnS3(AWS, downloadDir, downloadedFiles, s3BucketName, `${remotePath}/${YOUTUBE_REPORTING_FILES_BY_CREATE_TIMES}`, true));
        console.log('Downloaded files backuped on S3!');
      }

      // Storing the output state file for next run.
      const outputStateFile = await createStateFile(configOutDir, STATE_FILE, outputState);
      // Cleaning.
      const cleaning = await Promise.all(removeDirectories([ downloadDir ]));
      console.log('Extraction completed!');
    } else {
      console.log(`None on the specified report types (${reportTypes.join(',')} found! No data downloaded.`);
    };
    console.log('Youtube Reporting Api extraction process completed!');
    process.exit(0);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
