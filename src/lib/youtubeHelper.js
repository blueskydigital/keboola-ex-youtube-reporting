var _ = require('lodash')
var Q = require('q')
var fs = require('fs')
var csv = require('fast-csv')
var Baby = require('babyparse')
var path = require('path')
var crypto = require('crypto')
var moment = require('moment')
var google = require('googleapis')
var jsonfile = require('jsonfile')
var youtubeReporting = google.youtubereporting('v1')

var YoutubeHelper = {}
var command = require('./commandHelper')
var dataDir = path.join(command.data)
var config = require('./configHelper')(dataDir)
var auth = require('./oAuthHelper')(config)

var initialTimestamp = config.get('parameters:initial_timestamp') || moment().subtract(2, 'days').unix()
var maximumTimestamp = config.get('parameters:maximum_timestamp') || moment().unix()

// This method helps to reduce number of request by filtering out reportTypeId elements.
// If config file contains array of parameters:report_types then the user wants to download only these reports.
// Otherwhise everything is downloaded.
YoutubeHelper.filterJobs = function(inputJobs) {
  var filter = config.get('parameters:report_types')
  if (_.isUndefined(filter) || _.isEmpty(filter)) {
    return inputJobs
  } else {
    return _.filter(inputJobs, function(job) {
      return _.includes(filter, job.reportTypeId)
    })
  }
}

YoutubeHelper.groupTimestamps = function(configArray) {
  var groups = _.groupBy(configArray, function(value) {
    return value.jobId
  })

  return _.map(groups, function(group) {
    return {
      jobId: group[0].jobId,
      timestamps: _.pluck(group, 'timestamp')
    }
  })
}

YoutubeHelper.indexJobsAndTimestamps = function(groupedArray) {
  return _.chain(groupedArray).indexBy('jobId').mapValues('timestamps').value()
}

// A simple function that iterates over data rows and add md5 hash values of columns (defined in configuration)
// or add simple 'id' column in case of header row.
YoutubeHelper.addHash = function(inputObj, indexes) {
  return _.map(inputObj, function(row, index) {
    if (index === 0) {
      row.push('id')
    } else {
      row.push(crypto.createHash('md5').update(YoutubeHelper.generateHash(_.filter(row, function(column, index) {
        if (_.includes(indexes, index)) {
          return column
        }
      }))).digest('hex'))
    }

    return row
  })
}

YoutubeHelper.readIndexesOfDefinedKeys = function(inputKeys, headerArray) {
  return _.map(inputKeys, function(key) {
    return _.findIndex(headerArray, function(input) {
      return input === key
    })
  })
}

YoutubeHelper.generateHash = function(stringArray) {
  return _.reduce(stringArray, function(value, next) {
    return value + next
  })
}

YoutubeHelper.processArrayOfPromises = function(arrayOfPromises) {
  var promises = arrayOfPromises
  var results = []

  results = promises.map(function(promise){
    return promise()
  })

  return Q.all(results)
}

YoutubeHelper.processArrayOfPromisesInSeries = function(arrayOfPromises) {
  var p = Q()

  arrayOfPromises.forEach(function(promise) {
    p = p.then(function() {
      return promise()
    })
  })

  return p
}

YoutubeHelper.listJobs = function() {
  var deferred = Q.defer()

  youtubeReporting.jobs.list({
    onBehalfOfContentOwner: config.get('parameters:#onBehalfOfContentOwner'),
    auth: auth
  }, function(error, response) {
    if (error) {
      deferred.reject(error)
    } else {
      deferred.resolve(YoutubeHelper.filterJobs(response.jobs))
    }
  })

  return deferred.promise
}

YoutubeHelper.prepareArrayOfJobPromises = function(jobs) {
  var promises = []

  _.forEach(jobs, function(job){
    promises.push(
      (function(jobReport) {
        return function() {
          var deferred = Q.defer()
          if (_.isUndefined(jobReport)) {
            deferred.reject('No job specified!')
          } else {
            youtubeReporting.jobs.reports.list({
              onBehalfOfContentOwner: config.get('parameters:#onBehalfOfContentOwner'),
              pageSize: config.get('parameters:pagination'),
              auth: auth,
              jobId: jobReport.id
            }, function(error, response) {
              if (error) {
                deferred.reject(error)
              } else {
                // in case reports hadn't been generated. Returns empty array!
                if (_.isUndefined(response.reports)) {
                  deferred.resolve([])
                } else {
                  var reports = response.reports.filter(function(report) {
                    var createdTimestamp = moment(report.createTime, 'YYYY-MM-DDTHH:mm:ss.SSSSSSZ').unix()

                    report["reportTypeId"] = jobReport.reportTypeId

                    return createdTimestamp > jobReport.lastDownloadTimestamp && createdTimestamp < jobReport.maximumDownloadTimestamp
                  })

                  deferred.resolve(reports)
                }
              }
            })
          }

          return deferred.promise
        }
      })(job)
    )
  })

  return promises
}

YoutubeHelper.prepareArrayOfReportPromises = function(reportObjects) {
  var promises = []
  var reports = _.flattenDeep(reportObjects)

  _.forEach(reports, function(report) {
    promises.push(
      (function(reportDetail){
        return function() {
          var deferred = Q.defer()

          var resourceName = report.downloadUrl.substr(report.downloadUrl.indexOf('CONTENT_OWNER'), report.downloadUrl.length)
          youtubeReporting.media.download({
            onBehalfOfContentOwner: config.get('parameters:#onBehalfOfContentOwner'),
            auth: auth,
            resourceName: resourceName
          }, function(error, response) {
            if (error) {
              deferred.reject(error)
            } else {
              if (_.isUndefined(config.get('parameters:bucket'))) {
                deferred.reject("No attribute 'bucket' specified!")
              }

              if (_.isUndefined(config.get('parameters:primary_keys'))) {
                deferred.reject("No attribute 'primary_keys' specified!")
              }

              if (_.isUndefined(config.get('parameters:primary_keys')[report.reportTypeId])) {
                deferred.reject("No primary key for " + report.reportTypeId + " specified!")
              }

              var unixTimestamp = moment(report.createTime, 'YYYY-MM-DDTHH:mm:ss.SSSSSSZ').unix()

              var tablesDir = path.join(dataDir, 'out', 'tables')
              var fileName = report.id + '_' + unixTimestamp + '_' + report.reportTypeId + '.csv'
              var manifestName = fileName + '.manifest'

              var manifestString = {
                destination: config.get('parameters:bucket') + '.' + report.reportTypeId,
                incremental: true,
                primary_key: ['id']
              }

              var parsedFile = Baby.parse(response)
              var validData = _.dropRight(parsedFile["data"], 1)

              var keys = config.get('parameters:primary_keys')[report.reportTypeId]
              var header = _.first(validData)

              var duplicities = _.countBy(header, function(element) {
                return element
              })

              // we need to make sure there are no duplicities.
              // We need to find a way how to remove duplicities if there are some.
              var newHeader = _.map(header, function(element, index) {
                return (duplicities[element] > 1) ? element + '_' + index : element
              })

              var indexes = YoutubeHelper.readIndexesOfDefinedKeys(keys, header)
              // We need to make sure the header won't contain any duplicity
              validData[0] = newHeader

              // If there is a negative value, that means there is a invalid key.
              if (_.indexOf(indexes, -1) > 0) {
                deferred.reject("Invalid primary key value specified in " + report.reportTypeId + " array!")
              }

              csv
                .writeToPath(path.join(tablesDir, fileName), YoutubeHelper.addHash(validData, indexes), {headers:true})
                .on('error', function(error) {
                  deferred.reject(error)
                })
                .on('finish', function() {
                  jsonfile.writeFile(path.join(tablesDir, manifestName), manifestString, function(error) {
                    if (error) {
                      deferred.reject(error)
                    } else {
                      deferred.resolve({ jobId: report.reportTypeId, timestamp: unixTimestamp })
                    }
                  })
                })
            }
          })

          return deferred.promise
        }
      })(report)
    )
  })

  return promises
}

YoutubeHelper.readStateFile = function(filteredJobs) {
  var deferred = Q.defer()

  var dataInDir = path.join(dataDir, 'in')
  var fileName = 'state.json'

  jsonfile.readFile(path.join(dataInDir, fileName), function(error, object) {
    if (!error || error.code === 'ENOENT' ) {
      var jobs = filteredJobs.map(function(job) {
        job["lastDownloadTimestamp"] = (_.has(object, job.reportTypeId)) ? _.max(object[job["reportTypeId"]]) : initialTimestamp
        job["maximumDownloadTimestamp"] = maximumTimestamp

        return job
      })

      deferred.resolve(jobs)
    } else {
      deferred.reject(error)
    }
  })

  return deferred.promise
}

YoutubeHelper.synchronizeStateFile = function(downloadedObjects) {
  var deferred = Q.defer()

  if (downloadedObjects.length === 0) {
    deferred.resolve('No new data available!')
  } else {
    // First of all is necessary to load the original state.json file - to make sure we won't skip any value.
    var dataInDir = path.join(dataDir, 'in')
    var dataOutDir = path.join(dataDir, 'out')
    var fileName = "state.json"

    jsonfile.readFile(path.join(dataInDir, fileName), function(error, object) {
      if (!error || error.code === 'ENOENT' ) {
        var outputJson = YoutubeHelper.indexJobsAndTimestamps(YoutubeHelper.groupTimestamps(downloadedObjects))
        var outputObject = object || {}

        _.forIn(outputJson, function(value, key) {
          outputObject[key] = value
        })

        jsonfile.writeFile(path.join(dataOutDir, fileName), outputObject, function(error) {
          if (error) {
            deferred.reject(error)
          } else {
            deferred.resolve(fileName + ' synchronized!')
          }
        })
      } else {
        deferred.reject(error)
      }
    })
  }

  return deferred.promise
}

module.exports = YoutubeHelper