import csv from 'fast-csv';
import path from 'path';
import moment from 'moment';
import { parse } from 'babyparse';
import {
  first,
  sortBy,
  groupBy,
  includes,
  flattenDeep,
  isUndefined
} from 'lodash';
import {
  ERROR_TYPE,
  FINISH_TYPE,
  CREATE_TIME
} from '../constants';
import {
  transformEpochTimestampIntoDate
} from './keboolaHelper';

/**
 * This function reads all available jobs based on the input parameters.
 */
export function jobsList({ auth, onBehalfOfContentOwner, youtubeReporting }) {
  return new Promise((resolve, reject) => {
    youtubeReporting.jobs.list({
      auth,
      onBehalfOfContentOwner
    }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * This function reads the input jobs and get the only one the user requested.
 */
export function filterJobsList(jobs, reportTypes) {
  return jobs.filter(job => includes(reportTypes, job.reportTypeId));
}

/**
 * This function iterates over job filter and add information about createdAfter timestamp.
 */
export function extendJobsByAddingCreatedAfterDate(jobs, state, defaultTimestamp, ignoreStateFile) {
  return jobs.map(job => {
    return Object.assign({}, job, {
      createdAfter: transformEpochTimestampIntoDate(getJobTimestamp(job, state, defaultTimestamp, ignoreStateFile))
    });
  });
}

/**
 * This function reads jobs and based on the input values
 * prepares the correct initial timestamp for each input job.
 * If stored (state) value is much older than user wants to download,
 * the newest one is used.
 * If ignoreStateFile is true, the default timestamp/or specified in the config is applied.
 */
export function getJobTimestamp(job, state, defaultTimestamp, ignoreStateFile) {
  const { reportTypeId } = job;
  if (!isUndefined(state[reportTypeId]) && !ignoreStateFile) {
    return defaultTimestamp > state[reportTypeId]
      ? defaultTimestamp
      : state[reportTypeId];
  } else {
    return defaultTimestamp;
  }
}

/**
 * This function reads the reports based on the jobsId and date parameters.
 */
export function getReportList({
  auth,
  jobId,
  pageSize,
  pageToken,
  createdAfter,
  youtubeReporting,
  onBehalfOfContentOwner
}) {
  return new Promise((resolve, reject) => {
     youtubeReporting.jobs.reports.list({
       auth,
       jobId,
       pageSize,
       pageToken,
       createdAfter,
       onBehalfOfContentOwner
     }, (error, response) => {
       if (error) {
         reject(error);
       } else {
         resolve(response)
       }
     });
   });
}

/**
 * This function reads all reports for specified jobs and prepare a list for further download.
 */
export function prepareListOfReportsForDownload({
  auth,
  jobs,
  pageSize,
  createdAfter,
  youtubeReporting,
  onBehalfOfContentOwner
}) {
  return new Promise((resolve, reject) => {
    return async function() {
      try {
        let listOfReports = [];
        let hasMoreReports = false;
        let pageToken = null;
        for (const job of jobs) {
          while (!hasMoreReports) {
            const youtubeReports = await getReportList({
              auth,
              pageSize,
              pageToken,
              jobId: job.id,
              youtubeReporting,
              onBehalfOfContentOwner,
              createdAfter: job.createdAfter
            });
            pageToken = youtubeReports.nextPageToken;
            const reports = youtubeReports.reports || [];
            listOfReports = [ ...listOfReports, ...reports ];
            hasMoreReports = isUndefined(youtubeReports.nextPageToken);
          }
          hasMoreReports = false;
        }
        resolve(listOfReports);
      } catch (error) {
        reject(error);
      }
    }();
  });
}

/**
 * This function iterates over all records in an array and start downloading the reports.
 */
export function downloadReports({ auth, isBackup, reports, outputDirectory, youtubeReporting, onBehalfOfContentOwner }) {
  return reports
    .map(report => {
      return downloadSelectedReport({
        auth, report, isBackup, outputDirectory,
        youtubeReporting, onBehalfOfContentOwner
      });
    });
}

/**
 * This function simply download the specified report.
 */
export function downloadSelectedReport({
  auth,
  report,
  isBackup,
  outputDirectory,
  youtubeReporting,
  onBehalfOfContentOwner
}) {
  return new Promise((resolve, reject) => {
    const { jobId, createTime, downloadUrl, reportDate, reportTypeId } = report;
    const resourceName = downloadUrl.substr(downloadUrl.indexOf('CONTENT_OWNER'), downloadUrl.length);
    youtubeReporting.media.download({
      auth,
      resourceName,
      onBehalfOfContentOwner
    }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        const headers = true;
        const fileName = !isBackup
          ? `${reportTypeId}_${reportDate}.csv`
          : `${reportTypeId}_${createTime}.csv`;
        const parsedFile = parse(response);
        csv
          .writeToPath(path.join(outputDirectory, fileName), parsedFile.data, { headers })
          .on(ERROR_TYPE, error => reject(error))
          .on(FINISH_TYPE, () => resolve({ [ reportTypeId ]: createTime }));
      };
    });
  });
}

/**
 * This function groups reports by their types.
 */
export function groupReportsByTypes(reports, type) {
  return groupBy(reports, type);
}

/**
 * This function prepares a set (N records) of the oldest reports.
 */
export function getNumberOfOldestRecords(reports, limit, type) {
  return sortReportsForDownloadAndApplyLimit(groupReportsByTypes(reports, type), limit);
}

/**
 * This function reads the reports and sort the element by created dates from the oldest to the newest one.
 */
export function sortReportsForDownload(reportsByTypes) {
  return flattenDeep(Object
    .keys(reportsByTypes)
    .map(reportTypeId => {
      return sortBy(reportsByTypes[reportTypeId], CREATE_TIME);
    }));
}

/**
 * This function is similar sortReportsForDownload, however it also applies a limit to each array.
 */
export function sortReportsForDownloadAndApplyLimit(reportsByTypes, limit) {
  return flattenDeep(Object
    .keys(reportsByTypes)
    .map(reportTypeId => {
      return sortBy(reportsByTypes[reportTypeId], CREATE_TIME);
    })
    .map(reportTypeElements => {
      return reportTypeElements.slice(0, limit);
    }));
}

/**
 * This functions add extra metadata into the array of report elements which help to process the data for the better.
 * Extra metadata means reportTypeIds from jobs and some converted dates.
 */
export function addExtraReportMetadata(reports, jobs) {
  return reports
    .map(report => {
      const job = first(jobs.filter(job => job.id === report.jobId));
      return Object.assign({}, report, {
        reportDate: moment(first(report.startTime.split('T')),'YYYY-MM-DD').format('YYYYMMDD'),
        reportTypeId: job.reportTypeId
      });
    });
}
