// This file contains default constants of the application.
export const IN_DIR = 'in';
export const OUT_DIR = 'out';
export const STATE_FILE = 'state.json';
export const CONFIG_FILE = 'config.json';
export const DEFAULT_DATA_DIR = '/data';
export const DEFAULT_TABLES_IN_DIR = `/${IN_DIR}/tables`;
export const DEFAULT_TABLES_OUT_DIR = `/${OUT_DIR}/tables`;
export const DEFAULT_TOKEN_TYPE = 'Bearer';
export const PRIMARY_KEY = [ 'id' ];
export const IS_INCREMENTAL = true;
export const DEFAULT_PAGE_SIZE = 400;
export const KEY_FIELDS = [
  "date", "channel_id", "video_id", "country_code"
];
export const DEFAULT_YOUTUBE_NAMESPACES = [
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];
export const DEFAULT_START_DATE_TIMESTAMP = 1438430400;
export const DEFAULT_REDIRECT_URL = 'urn:ietf:wg:oauth:2.0:oob';
export const DEFAULT_OAUTH_EXPIRATION_TIMESTAMP = 1447278755869;

// Event types
export const END_TYPE = 'end';
export const ERROR_TYPE = 'error';
export const FINISH_TYPE = 'finish';
export const NON_EXISTING_FILE = 'ENOENT';
