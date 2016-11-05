import nconf from 'nconf';
import moment from 'moment';
import crypto from 'crypto';
import isThere from 'is-there';
import Promise from 'bluebird';
import {
  uniq,
  first,
  isArray,
  isEmpty,
  groupBy,
  isNumber,
  includes
} from 'lodash';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_TOKEN_TYPE,
  DEFAULT_REDIRECT_URL,
  DEFAULT_YOUTUBE_NAMESPACES,
  DEFAULT_START_DATE_TIMESTAMP,
  DEFAULT_OAUTH_EXPIRATION_TIMESTAMP
} from '../constants';
import {
  createStateFile,
  transformFilesByAddingAnIdElement
} from './fileHelper';

/**
 * This function simply reads the config and parse the input JSON object.
 * If requested file doesn't exist, program stop running.
 */
export function getConfig(configPath) {
  if (isThere(configPath)) {
    return nconf.env().file(configPath);
  } else {
    console.error('No configuration specified!');
    process.exit(1);
  }
}

/**
 * This is a simple helper that checks whether the input configuration is valid.
 * If so, the particular object with relevant parameters is returned.
 * Otherwise, an error is thrown.
 */
export function parseConfiguration(configObject) {
  return new Promise((resolve, reject) => {
    // Read OAuth2 credentials.
    const accessToken = configObject.get('parameters:#accessToken');
    if (!accessToken) {
      reject('Missing #accessToken parameter! Check out the documentation for more details.');
    }
    const clientId = configObject.get('parameters:#clientId');
    if (!clientId) {
      reject('Missing #clientId parameter! Check out the documentation for more details.');
    }
    const clientSecret = configObject.get('parameters:#clientSecret');
    if (!clientSecret) {
      reject('Missing #clientSecret parameter! Check out the documentation for more details.');
    }
    const refreshToken = configObject.get('parameters:#refreshToken');
    if (!refreshToken) {
      reject('Missing #refreshToken parameter! Check out the documentation for more details.');
    }
    const redirectUrl = configObject.get('parameters:redirectUrl') || DEFAULT_REDIRECT_URL;
    const expiryDate = configObject.get('parameters:expiryDate') || DEFAULT_OAUTH_EXPIRATION_TIMESTAMP;

    // Read contentOwnerId which will be used as onBehalfOfContentOwner parameter.
    const onBehalfOfContentOwner = configObject.get('parameters:#contentOwnerId');
    if (!onBehalfOfContentOwner) {
      reject('Missing #contentOwnerId parameter! Check out the documentation for more details.');
    }
    // Read the pageSize parameter.
    const pageSize = configObject.get('parameters:pageSize') || DEFAULT_PAGE_SIZE;
    if (!isNumber(pageSize)) {
      reject('Invalid pageSize parameter! Please use a numeric value. Check out the documentation for more details.');
    }
    // Initial timestamp.
    const initialTimestamp = parseInt(configObject.get('parameters:initialTimestamp') || DEFAULT_START_DATE_TIMESTAMP);
    if (!isNumber(initialTimestamp)) {
      reject('Invalid initialTimestamp parameter! Please use a numeric value. Check out the documentation for more details.');
    }

    // Check the report types array, which will be used for data downloading.
    const reportTypes = configObject.get('parameters:reportTypes');
    if (!reportTypes) {
      reject('Missing reportTypes parameter! Please specify the desired reportTypes in the array. Check out the documentation for more details.');
    }
    if (!isArray(reportTypes)) {
      reject('Invalid reportTypes parameter! The parameter must be an array of desired reportTypes. Check out the documentation for more details.');
    }
    if (isEmpty(reportTypes)) {
      reject('Array of reportTypes is empty! Please specify which reportTypes you want to download. Check out the documentation for more details.');
    }

    resolve({
      clientId,
      pageSize,
      expiryDate,
      accessToken,
      redirectUrl,
      reportTypes,
      clientSecret,
      refreshToken,
      initialTimestamp,
      onBehalfOfContentOwner,
      tokenType: DEFAULT_TOKEN_TYPE,
      scopes: DEFAULT_YOUTUBE_NAMESPACES
    });
  });
}

/**
 * This function reads the records from the array of downloaded object and get the latest downloaded data.
 */
export function getLatestCreatedDateForEachReportType(downloadedReports) {
  return downloadedReports
    .reduce((previous, current) => {
      const key = first(Object.keys(current));
      return Object.assign(previous, {
        [ key ] : current[ key ]
      });
    }, {});
}

/**
 * This function reads the epoch timestamp and transfer it into date suitable for Youtube Reporting API.
 */
export function transformEpochTimestampIntoDate(timestamp) {
  return `${moment(timestamp, "X").utc().format('YYYY-MM-DDTHH:mm:ss.SSSSSS')}Z`;
}

/**
 * This function reads all attributes from the object and transform all values into timestamps
 */
export function transformDatesIntoTimestamps(state) {
  return Object
    .keys(state)
    .reduce((previous, current) => {
      return Object.assign(previous, {
        [ current ]: parseInt(moment(state[ current ], 'YYYY-MM-DDTHH:mm:ss.SSSSSSZ').format('X'))
      });
    }, {});
}

/**
 * This function reads array of file names and prepare metadata which are going to be useful for file transfers.
 */
export function prepareMetadataForFileTransfers(files, sourceDir, destinationDir) {
  return files
    .map(file => {
      return {
        source: `${sourceDir}/${file}`,
        destination: `${destinationDir}/${file.slice(0,-13)}.csv`
      }
    });
}

/**
 * This function generates an object which will contain an id element
 */
export function generateUniqString(data, keys) {
  return Object.keys(data)
    .reduce((previous, current) => {
      if (includes(keys, current)) {
        return { id: `${previous['id']} ${data[current]}` };
      } else {
        return previous;
      }
    }, { id: '' });
}

/**
 * This function generate MD5 string which will serve as a primary key
 */
export function generatePrimaryKey(data, keys) {
  const { id } = generateUniqString(data, keys);
  return crypto
    .createHash('md5')
    .update(id)
    .digest('hex');
}

/**
 * This function prepares an array of promises which are leading towards
 * transfering files from the source directory into the destination.
 */
export function transferFilesFromSourceToDestination(metadata, keys) {
  return Promise.each(metadata, element => {
    const { source, destination } = element;
    return transformFilesByAddingAnIdElement(source, destination, keys);
  })
}

/**
 * This function combines data with the keys.
 */
export function combineDataWithKeys(data, keys) {
  return uniq(Object.keys(data))
    .reduce((previous, current) => {
      return Object.assign(previous, { [ current ]: data[ current ] });
    }, { id: generatePrimaryKey( data, keys ) });
}

/**
 * This function merges states files in order to not losing any timestamp.
 * This is important in situations when no new data is downloaded
 * (no risk of deleting any value in output state).
 * It add 1 seconds in order to skip downloading of the latest file
 * (which had been downloaded during the last time).
 */
export function combineStates(inputState, outputState) {
  return Object
    .keys(outputState)
    .reduce((previous, current) => {
      return Object.assign(previous, {
        [ current ]: outputState[ current ] + 1
      });
    }, inputState);
}

/**
 * This function iterates over input array of file names and returns promise
 * which is going to create a manifest file.
 */
export function generateManifestFiles(files, dataOutDir, state) {
  return files.map(file => {
    const tmpState = Object.assign({}, state, {
      destination: `in.c-ex_youtube_reporting_debug.${file.slice(0,-4)}`
    });
    return createStateFile(dataOutDir, `${file}.manifest`, tmpState);
  });
}
