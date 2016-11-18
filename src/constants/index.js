// This file contains default constants of the application.
export const IN_DIR = 'in';
export const OUT_DIR = 'out';
export const STATE_FILE = 'state.json';
export const CONFIG_FILE = 'config.json';
export const DEFAULT_DATA_DIR = '/data';
export const DEFAULT_S3_REGION = 'us-east-1';
export const DEFAULT_S3_OUTPUT_DIR = '/kbc_upload';
export const DEFAULT_TABLES_OUT_DIR = `/${OUT_DIR}/tables`;
export const DEFAULT_TOKEN_TYPE = 'Bearer';
export const PRIMARY_KEY = [ 'id' ];
export const YOUTUBE_REPORTING_FILES = 'youtube_reporting_data';
export const YOUTUBE_REPORTING_FILES_BY_CREATE_TIMES = `${YOUTUBE_REPORTING_FILES}_by_create_times`;
export const IS_INCREMENTAL = true;
export const DEFAULT_SYSTEM_MANAGED_INCLUDED = true;
export const DEFAULT_REPORT_TYPES_LIMIT = 3;
export const REPORTS_NUMBER_PER_REPORT_TYPE_LIMIT = 25;
export const DEFAULT_PAGE_SIZE = 300;
export const DEFAULT_YOUTUBE_NAMESPACES = [
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];
export const DEFAULT_START_DATE_TIMESTAMP = 1438430400;
export const DEFAULT_REDIRECT_URL = 'urn:ietf:wg:oauth:2.0:oob';
export const DEFAULT_OAUTH_EXPIRATION_TIMESTAMP = 1447278755869;

// Key suffixes
export const KEY_SUFFIXES = [
  "date", "id", "status", "type", "code", "detail"
];

// S3 Regions
export const S3_REGIONS = [
  "us-east-1", "us-west-1", "us-west-2", "eu-west-1",
  "eu-central-1", "ap-northeast-1", "ap-northeast-2",
  "ap-southeast-1", "ap-southeast-2", "sa-east-1"
];

// job types
export const JOB_ID = 'jobId';
export const REPORT_DATE = 'reportDate';
export const REPORT_TYPE_ID = 'reportTypeId';
export const UNIX_CREATE_TIME = 'createTimeUnixTimestamp';

// Field names
export const DATE_FIELD = 'date';

// Event types
export const END_TYPE = 'end';
export const ERROR_TYPE = 'error';
export const NON_EXISTING_FILE = 'ENOENT';
