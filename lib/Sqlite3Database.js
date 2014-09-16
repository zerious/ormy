var Database = require('./Database');
var fs = require('fs');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  // NPM module for the database driver.
  driverName: 'sql.js',

  // Field sub-class.
  fieldClassName: 'Sqlite3Field',

  connect: function connect(callback) {
    var db = this;
    var config = db.config;
    config.path = config.path || ':memory:';
    var dbbuffer  = undefined;
    if (config.path !== ':memory:') {
      try {
        dbbuffer = fs.readFileSync(config.path);
      } catch (e) {
        // file IO exception 
        callback(e);
        return;
      }
    }
    console.log('connecting');
    db.connection = new db.driver.Database(dbbuffer);
    callback(null);
  },

  /*
   * @Override function query(sql, callback)
   */
  query: function query(sql, callback) {
    var rows = [];
    this.connection.each(sql, function cb(row) {
      rows.push(row);
    }, function done() {
      callback(null, rows);
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
    try {
      db.connection.run(sql);
      // TODO:: needs to be tested under high concurrency situation
      db.query('SELECT last_insert_rowid() as id', function (err, rows) {
        console.log(err, rows);
        db.decorateItem(model, item);
        item.id = rows && rows[0] ? rows[0].id : undefined;
        callback(null, item);
      });
    } catch (err) {
      callback(err);
      db.logger.log('[Ormy] Query failed: ' + sql);
    }
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
    try {
      db.connection.run(sql);
      db.decorateItem(model, item);
      item.id = id;
      callback(null, item);
    } catch (err) {
      callback(err);
      db.logger.log('[Ormy] Query failed: ' + sql);
      return;
    }
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
      try {
        db.connection.run(sql);
        if (onSuccess) {
          onSuccess(null);
        }  
        else {
          db.logger.info('[Ormy] Created table: "' + model.table + '".');
        }
      } catch (err) {
        db.logger.error('[Ormy] Failed to create table: "' + model.table + '".\n' + sql);
        throw err;
      }
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
        try {
          db.connection.run('DROP TABLE `' + model.table + '`');
          createTable(function onSuccess() {
            db.logger.info('[Ormy] Dropped and re-created table "' + model.table + '".');
            callback(null);
          });
        } catch (err) {
          db.logger.error('[Ormy] Failed to drop table "' + model.table + '".');
          throw err;
        }
      }
      else {
        // TODO: Show diff.
        db.logger.warn('[Ormy] Table "' + model.table + '" is out of date.');
        callback(null);
      }
    });
  }

});
