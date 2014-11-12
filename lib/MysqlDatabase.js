var Database = require(__dirname + '/Database');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  // NPM module for the database driver.
  driverName: 'mysql',

  // Field sub-class.
  fieldProtoName: 'MysqlField',

  /**
   * Connect to a MySQL database.
   */
  connect: function connect(callback) {
    var db = this;
    var connected = false;
    db.connection = db.driver.createPool(db.config);
    db.connection.on('connection', function (connection) {
      if (!connected) {
        connected = true;
        callback();
      }
    });
  },

  /**
   * Synchronize a model by creating or re-creating its table.
   * TODO: ALTER TABLE instead of re-creating.
   */
  sync: function sync(model, callback) {
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
    sql += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8';

    function createTable(onSuccess) {
      db.query(sql, function (err) {
        if (err) {
          db.logger.error('[Ormy] Failed to create table: "' + model.table + '".\n' + sql);
          throw err;
        }
        else if (onSuccess) {
          onSuccess();
        }
        else {
          db.logger.info('[Ormy] Created table: "' + model.table + '".');
        }
      });
    }

    db.query('SHOW CREATE TABLE `' + model.table + '`', function (err, result) {
      var oldSql = (result ? result[0]['Create Table'] : '')
        .replace(/ AUTO_INCREMENT=[0-9]+/, '');
      if (!oldSql) {
        createTable();
      }
      else if (sql == oldSql) {
        db.logger.log('[Ormy] Table "' + model.table + '" is up-to-date.');
      }
      else if (model.forceSync) {
        // TODO: Alter table instead of re-creating.
        db.query('DROP TABLE `' + model.table + '`', function (err) {
          if (err) {
            db.logger.error('[Ormy] Failed to drop table "' + model.table + '".');
            throw err;
          }
          else {
            createTable(function () {
              db.logger.info('[Ormy] Dropped and re-created table "' + model.table + '".');
            });
          }
        });
      }
      else {
        // TODO: Show diff.
        db.logger.warn('[Ormy] Table "' + model.table + '" is out of date.');
      }
    });
  }

});
