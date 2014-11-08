var Database = require('./Database');
var spawn = require('child_process').spawn;
require('../common/json/read-stream');
require('../common/json/write-stream');

/**
 * A SqliteDatabase connects to SQLite.
 */
var SqliteDatabase = module.exports = Database.extend({

  // NPM module for the database driver.
  driverName: 'sql.js',

  // Field sub-class.
  fieldClassName: 'SqliteField',

  // Assign IDs to queries so their results can be received.
  queryId: 0,

  // Hang onto query callbacks until we receive results.
  queryCallbacks: {},

  /**
   * "Connect" by spawning a worker process.
   */
  connect: function (callback) {
    var db = this;
    var config = db.config || 0;

    // Spawn a SQLite process, with a path (or a "0" indicating a blank DB).
    db.worker = spawn(process.execPath, [
      __dirname + '/sqlite-spawn.js',
      config.path || 0], {stdio: 'pipe'});

    // If we receive output on stderr, the process may have failed.
    db.worker.stderr.on('data', function (data) {
      data = '' + data;
      if (/^execvp\(\)/.test(data)) {
        db.logger.warn('[Ormy] Failed to spawn SQLite worker.', data);
      }
    });

    // Get query results from the worker's stdout.
    db.input = JSON.readStream(db.worker.stdout, 'rows');
    db.output = JSON.writeStream(db.worker.stdin);

    // When we get rows, call the function that requested them.
    db.input.on('rows', function (pair) {
      var id = pair[0];
      var result = pair[1];
      var callback = db.queryCallbacks['_' + id];
      if (callback) {
        // The result can be an error or a collection.
        if (result instanceof Error) {
          callback(result);
        }
        else {
          callback(null, result);
        }
        // Free the callback from memory.
        delete db.queryCallbacks[id];
      }
    });

    // We're connected.
    callback();
  },

  /**
   * "Query" by writing to the worker process's stdin.
   */
  query: function (sql, callback) {
    var db = this;
    var id = ++db.queryId;
    db.queryCallbacks['_' + id] = callback;
    db.output.write([id, sql]);
  },

  /**
   * @Override function decorateItem (model, item)
   */
  decorateItem: function decorateItem(model, item) {
    var db = this;
    var fields = model.fields;
    Object.keys(item).forEach(function (key) {
      ['datetime', 'modified', 'created', 'deleted']
      .some(function (datetime) {
        var found = fields[key].type === datetime;
        if (found) {
          item[key] = new Date(item[key]);
        }
        return found;
      });
    });

    if (!item.save) {
      Object.defineProperty(item, 'save', {
        enumerable: false,
        value: function (callback) {
          if (item.id) {
            db.update(model, item, callback);
          }
        }
      });
    }

    if (!item.remove) {
      Object.defineProperty(item, 'remove', {
        enumerable: false,
        value: function (callback) {
          if (item.id) {
            db.delete(model, {id: item.id}, callback);
          }
        }
      });
    }
  },

  /**
   * @Override function getSetSql(model, item, mode, exclude)
   */
  getSetSql: function getSetSql(model, item, mode, exclude) {
    var sets = [];
    for (var fieldName in item) {
      var field = model.fields[fieldName];
      if (field && (fieldName !== exclude)) {
        var value = item[fieldName];
        if (item[fieldName] === null) {
          sets.push(field.column + '=NULL');
        }
        else {
          value = ('' + value).replace(/'/g, "\\'");
          sets.push('`' + field.column + "`='" + value + "'");
        }
      }
    }
    if (model.createdField && (mode === 'create')) {
      sets.push('`' + model.createdField.name +'`' + "=datetime('now')");
    }
    if (model.modifiedField) {
      sets.push('`' + model.modifiedField.name + '`'+ "=datetime('now')");
    }
    return ' SET ' + sets.join(',');
  },

  getFieldValues: function (model, item, mode, exclude) {
    var fields = [];
    var values = [];
    for (var fieldName in item) {
      var field = model.fields[fieldName];
      fields.push('`' + field.column + '`');

      if (field && (fieldName !== exclude)) {
        var value = item[fieldName];
        if (item[fieldName] === null) {
          values.push('NULL');
        }
        else {
          value = ('' + value).replace(/'/g, "\\'");
          values.push("'" + value + "'");
        }
      }
    }

    if (model.createdField && (mode === 'create')) {
      fields.push(model.createdField.name);
      values.push("datetime('now')");
    }
    if (model.modifiedField) {
      fields.push(model.modifiedField.name);
      values.push("datetime('now')");
    }

    return ' (' + fields.join(',') + ') VALUES (' + values.join(',') + ')';
  },

  /**
   * Execute an INSERT then a SELECT synchronously to retrieve the ID.
   */
  create: function create(model, item, callback) {
    var db = this;
    db.query(
      [
        'INSERT INTO ' + model.table + db.getFieldValues(model, item, 'create'),
        'SELECT last_insert_rowid() as id'
      ],
      function (err, rows) {
        if (err) {
          callback(err);
        }
        else {
          db.decorateItem(model, item);
          item.id = rows && rows[0] ? rows[0].id : undefined;
          callback(null, item);
        }
      }
    );
  },

  /**
   * @Override function update (model, item, callback)
   */
  update: function update(model, item, callback) {
    var db = this;
    var id = item.id * 1;
    delete item.id;
    var sql = 'UPDATE ' + model.table +
      db.getSetSql(model, item, 'save', 'id') +
      db.getWhereSql(model, {id: id});
    db.query(sql, function (err) {
      if (err) {
        callback(err);
      }
      else {
        db.decorateItem(model, item);
        item.id = id;
        callback(null, item);
      }
    });
  },

  sync: function sync(model, callback) {
    callback = callback || function voidCallback() {};
    var db = this;
    var sql = 'CREATE TABLE `' + model.table + '` (\n  ';
    var lines = [];
    var pKeys = [];
    for (var name in model.fields) {
      var field = model.fields[name];
      lines.push(field.getCreateSql());
      if (field.primary) {
        pKeys.push(field.column);
      }
    }
    if (pKeys.length) {
      lines.push('PRIMARY KEY (`' + pKeys.join('`, `') + '`)');
    }
    sql += lines.join(',\n  ');
    sql += '\n)';

    function createTable(onSuccess) {
      db.query(sql, function (err) {
        if (err && !/already exists/.test(err.message)) {
          db.logger.error('[Ormy] Failed to create table: "' + model.table + '".\n' + sql);
          throw err;
        }
        else if (onSuccess) {
          onSuccess(null);
        }
        else {
          db.logger.info('[Ormy] Created table: "' + model.table + '".');
        }
      });
    }

    db.query('SELECT sql FROM SQLITE_MASTER WHERE type=\'table\' AND tbl_name=\'' + model.table + '\'', function (err, result) {
      var oldSql = (result && result[0] ? result[0]['sql']: '')
        .replace(/ AUTOINCREMENT=[0-9]+/, '');

      if (!oldSql) {
        createTable(callback);
      }
      else if (sql === oldSql) {
        db.logger.log('[Ormy] Table "' + model.table + '" is up-to-date.');
        callback();
      }
      else if (model.forceSync) {
        // TODO: Alter table instead of re-creating.
        db.query('DROP TABLE `' + model.table + '`', function (err) {
          if (err) {
            db.logger.error('[Ormy] Failed to drop table "' + model.table + '".');
            throw err;
          }
          else {
            db.connection.run();
            createTable(function onSuccess() {
              db.logger.info('[Ormy] Dropped and re-created table "' + model.table + '".');
              callback(null);
            });
          }
        });
      }
      else {
        // TODO: Show diff.
        db.logger.warn('[Ormy] Table "' + model.table + '" is out of date.');
        callback(null);
      }
    });
  }

});
