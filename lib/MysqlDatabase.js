var mysql = require('mysql');
var Database = require(__dirname + '/Database');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  // Field sub-class.
  fieldTypeName: 'MysqlField',

  /**
   * Connect to a MySQL database using a connection pool.
   */
  connect: function () {
    var self = this;
    self.connection = mysql.createPool(self.config);
    self.connection.on('connection', function (connection) {
      self.emit('connected', connection);
    });
  },

  /**
   * Synchronize a model by creating or re-creating its table.
   * TODO: ALTER TABLE instead of re-creating.
   */
  sync: function (model) {
    var self = this;
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
      self.query(sql, function (err) {
        if (err) {
          self.logger.error('[Ormy] Failed to create table: "' + model.table + '".\n' + sql);
          throw err;
        }
        else if (onSuccess) {
          onSuccess();
        }
        else {
          self.logger.info('[Ormy] Created table: "' + model.table + '".');
        }
      });
    }

    self.query('SHOW CREATE TABLE `' + model.table + '`', function (err, result) {
      var oldSql = (result ? result[0]['Create Table'] : '')
        .replace(/ AUTO_INCREMENT=[0-9]+/, '');
      if (!oldSql) {
        createTable();
      }
      else if (sql == oldSql) {
        self.logger.log('[Ormy] Table "' + model.table + '" is up-to-date.');
      }
      else if (model.forceSync) {
        // TODO: Alter table instead of re-creating.
        self.query('DROP TABLE `' + model.table + '`', function (err) {
          if (err) {
            self.logger.error('[Ormy] Failed to drop table "' + model.table + '".');
            throw err;
          }
          else {
            createTable(function () {
              self.logger.info('[Ormy] Dropped and re-created table "' + model.table + '".');
            });
          }
        });
      }
      else {
        // TODO: Show diff.
        self.logger.warn('[Ormy] Table "' + model.table + '" is out of date.');
      }
    });
  }

});
