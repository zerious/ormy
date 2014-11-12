/**
 * Different database types instantiate different Database sub-classes.
 */
var databaseTypeProtoes = {
  mysql: 'MysqlDatabase',
  sqlite: 'SqliteDatabase'
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
    throw new Error('[Ormy] Logger must have error, warn, info and log methods.');
  }

  // Validate the database type to ensure we have a class for it.
  var type = (config.type || 'mysql');
  // Don't use version numbers.
  type = type.replace(/[\d\.]+/g, '');
  var className = databaseTypeProtoes[type.toLowerCase()];
  if (!className) {
    throw new Error('[Ormy] Unsupported database type: "' + type + '"');
  }

  // Instantiate a database of the desired type.
  var Database = require(__dirname + '/lib/' + className);
  return new Database(config);

};

/**
 * Limit the maximum number of results that can be requested.
 */
ormy._MAX_RESULTS = 1e5;

// Expose the version number, but only load package JSON if a get is performed.
Object.defineProperty(ormy, 'version', {
  enumerable: false,
  get: function () {
    return require(__dirname + '/package.json').version;
  }
});
