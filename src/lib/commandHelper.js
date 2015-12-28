var program = require('commander')

program
  .version('1.0.0')
  .option('-d, --data <path>', 'set path to the config directory, defaults to /data', '/data')
  .parse(process.argv)

module.exports = program