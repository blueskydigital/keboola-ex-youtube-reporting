var YoutubeHelper = require('./lib/youtubeHelper')

YoutubeHelper.listJobs()
  .then(YoutubeHelper.readStateFile)
  .then(YoutubeHelper.prepareArrayOfJobPromises)
  .then(YoutubeHelper.processArrayOfPromises)
  .then(YoutubeHelper.prepareArrayOfReportPromises)
  .then(YoutubeHelper.processArrayOfPromisesInSeries)
  .then(YoutubeHelper.synchronizeStateFile)
  .then(function(message) {
    console.log(message)
    process.exit(0)
  })
  .catch(function(error) {
    console.error(error)
    process.exit(1)
  })
