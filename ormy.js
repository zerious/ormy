/**
 * Different database types instantiate different Database sub-classes.
 */
var classes = {
  mysql: 'MysqlDatabase'
};

/**
 * The main API function accepts a config and returns a database.
 */
var ormy = module.exports = function (config) {

  // Validate the logger to ensure the desired methods exist.
  var log = config.logger = config.logger || console;
  if (
    typeof log.error != 'function' ||
    typeof log.warn != 'function' ||
    typeof log.info != 'function' ||
    typeof log.log != 'function') {
    log.error('Database logger must have error, warn, info and log methods.');
  }

  // Validate the database type to ensure we have a class for it.
  var type = config.type || 'mysql';
  var className = classes[type.toLowerCase()];
  if (!className) {
    log.error('Unsupported database type: "' + type + '"');
  }

  // Instantiate a database of the desired type.
  var Database = require('./lib/' + className);
  return new Database(config);

};

/**
 * Expose the version to module users.
 */
ormy.version = require('./package.json').version;

/**
 * Limit the maximum number of results that can be requested.
 */
ormy._MAX_RESULTS = 1e5;
