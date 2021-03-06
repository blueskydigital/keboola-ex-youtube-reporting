import fs from 'fs';
import tmp from 'tmp';
import csv from 'fast-csv';
import path from 'path';
import isThere from 'is-there';
import jsonfile from 'jsonfile';
import rimraf from 'rimraf-promise';
import {
  last,
  first,
  isNull,
  findIndex
} from 'lodash';
import {
  END_TYPE,
  ERROR_TYPE,
  NON_EXISTING_FILE
} from '../constants';
import {
  combineDataWithKeys
} from './keboolaHelper';

/**
 * This function creates a temp directory where the files are going to be downloaded.
 */
export function createTmpDirectory() {
  return new Promise((resolve, reject) => {
    tmp.dir((error, path) => {
      if (error) {
        reject(error);
      } else {
        resolve(path);
      }
    });
  });
}

/**
 * This function reads files from specified.
 */
export function readFilesFromDirectory(filesDirectory) {
  return new Promise((resolve, reject) => {
    fs.readdir(filesDirectory, (error, files) => {
      if (error) {
        reject(error);
      } else {
        resolve(files);
      }
    });
  });
}

/**
 * This function is going to make the actual tranfer via streams.
 * It also modify the input file and generate an key element which helps
 * to store the object in Keboola Connection.
 */
export function transformFilesByAddingAnIdElement(source, destination, reportType, keyFields, customPrimaryKeys) {
  return new Promise((resolve, reject) => {
    const headers = !isThere(destination);
    const includeEndRowDelimiter = true;
    const readStream = fs.createReadStream(source);
    const csvStream = csv.createWriteStream({ headers, includeEndRowDelimiter });
    const writeStream = fs.createWriteStream(destination, { flags: 'a', encoding: 'utf8'});
    csv
      .fromStream(readStream, { headers: true })
      .transform(obj => combineDataWithKeys(obj, reportType, keyFields, customPrimaryKeys))
      .on(ERROR_TYPE, error => {
        reject(error);
      })
      .pipe(csvStream)
      .pipe(writeStream)
      .on('finish', () => {
        resolve(`${destination} transfered!`);
      });
  });
}

/**
 * This function reads the input state file.
 * If not exists, an empty object is returned.
 */
export function readStateFile(stateDir, file) {
  return new Promise((resolve, reject) => {
    jsonfile.readFile(path.join(stateDir, file), (error, object) => {
      if (error) {
        if (error.code === NON_EXISTING_FILE) {
          resolve({});
        } else {
          reject(error);
        }
      } else {
        resolve(object);
      }
    });
  });
}

/**
 * This function simply create a json file containing data passed as a parameter.
 */
export function createStateFile(stateDir, file, data) {
  return new Promise((resolve, reject) => {
    jsonfile.writeFile(path.join(stateDir, file), data, {}, error => {
      if (error) {
        reject(error);
      } else {
        resolve('State file created!');
      }
    });
  });
}

/**
 * Cleaning the array of directories.
 */
export function removeDirectories(directories) {
  return directories.map(directory => rimraf(directory));
}
