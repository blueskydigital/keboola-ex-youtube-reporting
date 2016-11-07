import nconf from 'nconf';
import moment from 'moment';
import crypto from 'crypto';
import isThere from 'is-there';
import Promise from 'bluebird';
import {
  uniq,
  size,
  last,
  first,
  isNaN,
  isArray,
  isEmpty,
  groupBy,
  isNumber,
  includes,
  toNumber,
  isObject,
  isUndefined
} from 'lodash';
import {
  S3_REGIONS,
  DATE_FIELD,
  DEFAULT_PAGE_SIZE,
  DEFAULT_S3_REGION,
  DEFAULT_TOKEN_TYPE,
  DEFAULT_REDIRECT_URL,
  DEFAULT_S3_OUTPUT_DIR,
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

    // Read contentOwnerId which will be used as onBehalfOfContentOwner parameter.
    const onBehalfOfContentOwner = configObject.get('parameters:#contentOwnerId');
    if (!onBehalfOfContentOwner) {
      reject('Missing #contentOwnerId parameter! Check out the documentation for more details.');
    }

    // Initial timestamp.
    const initialTimestamp = parseInt(configObject.get('parameters:initialTimestamp') || DEFAULT_START_DATE_TIMESTAMP);
    if (!isNumber(initialTimestamp)) {
      reject('Invalid initialTimestamp parameter! Please use a numeric value. Check out the documentation for more details.');
    }

    // User can also overwrite the default rules for generating the primary keys by adding a custom key array for particular report type.
    // If he does that, we need to make sure the related parameters are passed properly.
    const customPrimaryKeys = configObject.get('parameters:customPrimaryKeys');
    if (!isUndefined(customPrimaryKeys)) {
      // It must be an object.
      if (!isObject(customPrimaryKeys)) {
        reject('Optional customPrimaryKey parameter must be an object! Remove it or set it as an object! Check out the documentation for more details.');
      }
      // We should iterates over the keys and verify, there is a non-empty array set for each of them.
      Object
        .keys(customPrimaryKeys)
        .forEach(reportTypeId => {
          if (!isArray(customPrimaryKeys[reportTypeId])) {
            reject(`Value for ${reportTypeId} attribute is not array! Please use array for specification of the key elements!`);
          }
          if (isEmpty(customPrimaryKeys[reportTypeId])) {
            reject(`Array of ${reportTypeId} attribute is empty! Remove it or specify any field name which will be used as a part of a key element!`);
          }
        });
    }

    // S3 related configuration (for backup purposes).
    const s3OutputOnly = !isUndefined(configObject.get('parameters:s3OutputOnly'))
      ? configObject.get('parameters:s3OutputOnly')
      : false;

    const s3Backup = !isUndefined(configObject.get('parameters:s3Backup'))
      ? configObject.get('parameters:s3Backup')
      : false;

    const s3AccessKeyId = configObject.get('parameters:#s3AccessKeyId');
    const s3SecretAccessKey = configObject.get('parameters:#s3SecretAccessKey');
    const s3BucketName = configObject.get('parameters:s3BucketName');
    const s3RemotePath = configObject.get('parameters:s3RemotePath') || '/';
    const s3Region = configObject.get('parameters:s3Region') || DEFAULT_S3_REGION;
    const remotePath = s3RemotePath === '/' ? DEFAULT_S3_OUTPUT_DIR : s3RemotePath;

    // If S3 is requested, we must make sure the credentials are defined.
    if (s3OutputOnly || s3Backup) {
      if (isUndefined(s3AccessKeyId) || isUndefined(s3SecretAccessKey) || isUndefined(s3BucketName)) {
        reject('You want to write data to s3, but no s3 credentials specified. Check out the documentation for more details.');
      }

      if (!includes(S3_REGIONS, s3Region)) {
        reject(`Invalid S3 Region! Only values ${S3_REGIONS.join(', ')} are allowed. Check out the documentation for more details.`);
      }
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
    if (size(uniq(reportTypes)) > 3) {
      reject('There are only 3 elements allowed to have in the same configuration. Create a new one, if you wants more. Check out the documentation for more details.');
    }

    // This parameter can overwrite the stored timestamps in the state file.
    // It is useful, when you want to use the existing configuration for downloading all data from scratch .
    // After first usage, you must to set it back to false, otherwhise it will always download data from the beginning.
    const ignoreStateFile = !isUndefined(configObject.get('parameters:ignoreStateFile'))
      ? configObject.get('parameters:ignoreStateFile')
      : false;

    resolve({
      clientId,
      s3Backup,
      s3Region,
      remotePath,
      accessToken,
      s3OutputOnly,
      clientSecret,
      refreshToken,
      s3BucketName,
      s3AccessKeyId,
      ignoreStateFile,
      initialTimestamp,
      s3SecretAccessKey,
      onBehalfOfContentOwner,
      reportTypes: uniq(reportTypes),
      pageSize: DEFAULT_PAGE_SIZE,
      tokenType: DEFAULT_TOKEN_TYPE,
      redirectUrl: DEFAULT_REDIRECT_URL,
      scopes: DEFAULT_YOUTUBE_NAMESPACES,
      customPrimaryKeys: customPrimaryKeys || {},
      expiryDate: DEFAULT_OAUTH_EXPIRATION_TIMESTAMP
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
        reportType: `${file.slice(0,-13)}`,
        source: `${sourceDir}/${file}`,
        destination: `${destinationDir}/${file.slice(0,-13)}.csv`
      }
    });
}

/**
 * This function generates an object which will contain an id element
 */
export function generateUniqString(data, reportType, keyFields, customPrimaryKeys) {
  return Object.keys(data)
    .reduce((previous, current) => {
      if (isFieldAPartOfAKey(data, current, keyFields, reportType, customPrimaryKeys)) {
        return { id: `${previous['id']} ${data[current]}` };
      } else {
        return previous;
      }
    }, { id: '' });
}

/**
 * This function verify, whether the field should be considered as a part of the primary key.
 * User can specify a custom key for each report type. If he does, these fields will be used.
 * In other cases, the function tries to convert the actual value. If the value is not numeric/or it is date, we should consider that as a key.
 * It also verifies some common name patterns if the fieldName contains them. If so, we should consider that as a key.
 * Otherwise we are not going to use that field as a key.
 */
export function isFieldAPartOfAKey(data, fieldName, keyFields, reportType, customPrimaryKeys) {
  if (customPrimaryKeys[reportType]) {
    return includes(customPrimaryKeys[reportType], fieldName);
  } else {
    if (isNaN(toNumber(data[fieldName])) || fieldName === DATE_FIELD) {
      return true;
    } else if (includes(keyFields, last(fieldName.split('_')))) {
      return true;
    } else {
      return false;
    }
  }
}

/**
 * This function generate MD5 string which will serve as a primary key
 */
export function generatePrimaryKey(data, reportType, keyFields, customPrimaryKeys) {
  const { id } = generateUniqString(data, reportType, keyFields, customPrimaryKeys);
  return crypto
    .createHash('md5')
    .update(id)
    .digest('hex');
}

/**
 * This function prepares an array of promises which are leading towards
 * transfering files from the source directory into the destination.
 */
export function transferFilesFromSourceToDestination(metadata, keyFields, customPrimaryKeys) {
  return Promise.each(metadata, element => {
    const { source, destination, reportType } = element;
    return transformFilesByAddingAnIdElement(source, destination, reportType, keyFields, customPrimaryKeys);
  })
}

/**
 * This function combines data with the keys.
 */
export function combineDataWithKeys(data, reportType, keyFields, customPrimaryKeys) {
  return uniq(Object.keys(data))
    .reduce((previous, current) => {
      return Object.assign(previous, { [ current ]: data[ current ] });
    }, { id: generatePrimaryKey( data, reportType, keyFields, customPrimaryKeys ) });
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
