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
  FINISH_TYPE
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
export function extendJobsByAddingCreatedAfterDate(jobs, state, defaultTimestamp) {
  return jobs.map(job => {
    return Object.assign({}, job, {
      createdAfter: transformEpochTimestampIntoDate(getJobTimestamp(job, state, defaultTimestamp))
    });
  });
}

/**
 * This function reads jobs and based on the input values
 * prepares the correct initial timestamp for each input job.
 * If stored (state) value is much older than user wants to download,
 * the newest one is used.
 */
export function getJobTimestamp(job, state, defaultTimestamp) {
  const { reportTypeId } = job;
  if (!isUndefined(state[reportTypeId])) {
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
            const newReports = youtubeReports.reports || [];
            listOfReports = [ ...listOfReports, ...newReports ];
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
export function downloadReports({ auth, reports, outputDirectory, youtubeReporting, onBehalfOfContentOwner }) {
  return reports
    .map(report => {
      return downloadSelectedReport({
        auth, report, outputDirectory,
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
        const fileName = `${reportTypeId}_${reportDate}.csv`;
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
export function groupReportsByTypes(reports) {
  return groupBy(reports, 'jobId');
}

/**
 * This function reads the reports and sort the element by created dates from the oldest to the newest one.
 */
export function sortReportsForDownload(reportsByTypes) {
  return flattenDeep(Object
    .keys(reportsByTypes)
    .map(reportTypeId => {
      return sortBy(reportsByTypes[reportTypeId], 'createTime');
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
