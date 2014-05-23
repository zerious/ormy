var ormy = module.exports = function (config) {
  config.type = config.type || 'mysql';
  var capType = config.type[0].toUpperCase() + config.type.substr(1);
  var Database = require('./lib/' + capType + 'Database');
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
