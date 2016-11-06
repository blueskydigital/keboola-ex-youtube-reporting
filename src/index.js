import path from 'path';
import rimraf from 'rimraf-promise';
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
  readStateFile,
  createStateFile,
  createTmpDirectory,
  runPromisesInSeries,
  readFilesFromDirectory
} from './helpers/fileHelper';
import {
  getConfig,
  combineStates,
  parseConfiguration,
  generateManifestFiles,
  transformDatesIntoTimestamps,
  prepareMetadataForFileTransfers,
  transferFilesFromSourceToDestination,
  getLatestCreatedDateForEachReportType
} from './helpers/keboolaHelper';
import {
  jobsList,
  getReportList,
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
  REPORTS_NUMBER_PER_REPORT_TYPE_LIMIT
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
      tokenType,
      expiryDate,
      accessToken,
      redirectUrl,
      reportTypes,
      clientSecret,
      refreshToken,
      ignoreStateFile,
      initialTimestamp,
      customPrimaryKeys,
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
      ), REPORTS_NUMBER_PER_REPORT_TYPE_LIMIT, REPORT_TYPE_ID);

      // Here we are going to download each report and wait until the process is completed.
      const downloadedReports = await Promise.all(downloadReports({
        auth, reports, onBehalfOfContentOwner,
        youtubeReporting, outputDirectory: downloadDir
      }));

      // In this step we are going to download names of the files we downloaded in the previous step.
      const downloadedFiles = await readFilesFromDirectory(downloadDir);

      // We also have to prepare the proper metadata for file transfer.
      const fileMetadata = prepareMetadataForFileTransfers(downloadedFiles, downloadDir, dataOutDir);

      // Now it is time to transfer files from the source directory (tmp directory) into destination (table output dir).
      const transferedFiles = await transferFilesFromSourceToDestination(fileMetadata, KEY_SUFFIXES, customPrimaryKeys);

      // This function prepares the data for state.json configuration.
      const outputState = combineStates(inputState, transformDatesIntoTimestamps(
        getLatestCreatedDateForEachReportType(downloadedReports)
      ));

      // We need to create manifests which stores data in Keboola.
      const mergedFiles = await readFilesFromDirectory(dataOutDir);
      const manifests = await Promise.all(generateManifestFiles(mergedFiles, dataOutDir, { incremental: IS_INCREMENTAL, primary_key: PRIMARY_KEY }));

      // Storing the output state file for next run.
      const outputStateFile = await createStateFile(configOutDir, STATE_FILE, outputState);
      // Cleaning.
      const cleaning = await rimraf(downloadDir);
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
