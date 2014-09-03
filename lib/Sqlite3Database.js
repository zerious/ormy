var Database = require('./Database');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  // NPM module for the database driver.
  driverName: 'sqlite3',

  // Field sub-class.
  fieldClassName: 'Sqlite3Field',

  connect: function connect(callback) {
    var db = this;
    var config = db.config;
    config.path = config.path || ':memory:';
    db.connection = new db.driver.Database(config.path);
    callback(null);
  },

  /*
   * @Override function query(sql, callback)
   */
  query: function query(sql, callback) {
    this.connection.all(sql, function (err, rows) {
        if (err) {
          err.sql = sql;
        }
        callback(err, rows);
    });
  },

  /*
   * @Override function decorateItem (model, item)
   */
  decorateItem: function decorateItem(model, item) {
    var db = this;
    // decoreate datetime Fields
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

  /*
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
   * @Override function create(model, item, callback)
   */
  create: function create(model, item, callback) {
    var db = this;
    var sql = 'INSERT INTO ' + model.table + db.getFieldValues(model, item, 'create');
    db.connection.run(sql, function (err) {
      if (err) {
        callback(err);
        db.logger.log('[Ormy] Query failed: ' + sql);
      }
      else {
        item = item || {};
        db.decorateItem(model, item);
        item.id = this.lastID;
        delete item.insertId;
        callback(null, item);
      }
    });
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
    db.connection.run(sql, function (err) {
      if (err) {
        callback(err);
        db.logger.log('[Ormy] Query failed: ' + sql);
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
      db.connection.run(sql, function (err) {
        if (err) {
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
        db.connection.run('DROP TABLE `' + model.table + '`', function (err) {
          if (err) {
            db.logger.error('[Ormy] Failed to drop table "' + model.table + '".');
            throw err;
          }
          else {
            createTable(function () {
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
