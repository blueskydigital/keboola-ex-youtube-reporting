var path = require('path')
var nconf = require('nconf')
var yaml = require('nconf-yaml')
var isThere = require('is-there')

module.exports = function(dataDir) {
  var configJson = 'config.json'
  var configYaml = 'config.yaml'
  var config = nconf.env()

  if (isThere(path.join(dataDir, configJson))) {
    config.file(path.join(dataDir, configJson))
  } else if (isThere(path.join(dataDir, configYaml))) {
    config.file({
      file: path.join(dataDir, configYaml),
      format: yaml
    })
  } else {
    console.error('No config specified!')
    process.exit(1)
  }

  return config
}