import fs from 'fs';
import es from 'event-stream';
import tmp from 'tmp';
import csv from 'fast-csv';
import path from 'path';
import isThere from 'is-there';
import jsonfile from 'jsonfile';
import firstline from 'firstline';
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
 * Usage of low level functions that reduce memory consumption.
 */
export function transformFilesByAddingAnIdElementLowLevel(source, destination, reportType, keyFields, customPrimaryKeys, index) {
  return new Promise((resolve, reject) => {
      let lineNumber = 0;
      const fileNotExist = !isThere(destination);
      firstline(source)
        .then(header => {
          const writeStream = fs.createWriteStream(destination, { flags : 'a' });
          const readStream = fs.createReadStream(source)
            .pipe(es.split())
            .pipe(es.mapSync(line => {
              // pause the readstream
              readStream.pause();
              csv.fromString(line)
                .on("error", error => {
                  reject(error);
                })
                .on("data", data => {
                  if (lineNumber === 0 && fileNotExist) {
                    writeStream.write('id,'+ header + '\n');
                  } else if (lineNumber > 0) {
                    const row = header
                      .split(',')
                      .reduce((previous, current) => {
                        const referenceKeys = header.split(',');
                        const keyIndex = findIndex(referenceKeys, index => index === current);
                        return Object.assign({}, previous, { [current]: data[keyIndex]} );
                      }, {});
                    const test = combineDataWithKeys(row, reportType, keyFields, customPrimaryKeys);
                    const record = Object
                      .keys(test)
                      .map(value => `"${test[value]}"`)
                      .toString();
                    writeStream.write(record + '\n');
                  }
                })
                .on("end", () => {
                  lineNumber += 1;
                  readStream.resume();
                });
            })).on('error', error => {
              reject(error);
            }).on('end', function(){
              const output = last(source.split('/')).split('|');
              const reportType = first(output);
              const reportDate = output[1];
              const generateTime = last(output).slice(0, -4);
              const message = `${reportType} generated on ${generateTime} (data for ${reportDate}) parsed!`;
              console.log(message);
              resolve(message);
            });
        }).catch(error => {
        reject(error);
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
      .on(END_TYPE, () => {
        resolve(`${destination} transfered!`);
      })
      .pipe(csvStream)
      .pipe(writeStream);
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

/**
 * This function just stores data to selected destination.
 * Data is appending to a file, the first one needs to have a header.
 */
export function createOutputFile(fileName, inputData) {
  return new Promise((resolve, reject) => {
    const data = !isArray(inputData)
      ? [ inputData ]
      : inputData;
    const headers = !isThere(fileName);
    const includeEndRowDelimiter = true;
    csv
      .writeToStream(fs.createWriteStream(fileName, {'flags': 'a'}), data, { headers, includeEndRowDelimiter })
      .on(EVENT_ERROR, () => reject('Problem with writing data into output!'))
      .on(EVENT_FINISH, () => resolve(fileName));
  });
}
