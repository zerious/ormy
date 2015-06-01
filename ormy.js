var Database = require(__dirname + '/lib/database');
var Model = require(__dirname + '/lib/model');
var Field = require(__dirname + '/lib/field');

/**
 * The main API function accepts a configuration and returns a database.
 */
var ormy = module.exports = function (config, app) {

  // Ensure there's a config.
  config = config || {};

  // Validate the log to ensure the desired methods exist.
  var log = config.log = (config.log || console);
  if (
    typeof log.error != 'function' ||
    typeof log.warn != 'function' ||
    typeof log.info != 'function' ||
    typeof log.log != 'function') {
    throw new Error('[Ormy] Log must have error, warn, info and log methods.');
  }

  // Adapters have lowercase names like "mysql".
  var adapter = (config.adapter || 'mysql');

  var AdapterDatabase = ormy.adapters[adapter];
  if (!AdapterDatabase) {
    throw new Error('[Ormy] Unsupported database adapter: "' + adapter + '"');
  }

  // Built-in adapters just have true values in the adapters collection.
  if (AdapterDatabase === true) {
    AdapterDatabase = require(__dirname + '/lib/' + adapter + '-database');
  }

  // Instantiate a database from the adapter.
  var db = new AdapterDatabase(config);
  if (app) {
    db.app = app;
  }

  // Link to the appropriate field and model classes.
  db.Field = db.Field || Field;
  db.Model = db.Model || Model;

  return db;

};

/**
 * Limit the maximum number of results that can be requested.
 */
ormy._MAX_RESULTS = 1e5;

/**
 * Supported database adapters.
 */
ormy.adapters = {
  mysql: true,
  ringer: true,
  sqlite: true
};

// Expose the version number, but only load package JSON if a get is performed.
Object.defineProperty(ormy, 'version', {
  enumerable: false,
  get: function () {
    return require(__dirname + '/package.json').version;
  }
});
