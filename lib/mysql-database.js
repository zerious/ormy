var mysql = require('mysql');
var Database = require(__dirname + '/database');
var caser = require('../common/string/caser');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  // Field sub-class.
  fieldTypeName: 'mysql-field',

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
      lines.push('PRIMARY KEY (`' + pKeys.join('`,`') + '`)');
    }
    var columnCaser = caser[model.columnCase];
    if (model.indexes) {
      model.indexes.forEach(function (fields) {
        var name = columnCaser(fields.join(' '));
        var columns = [];
        fields.forEach(function (field) {
          var column = '`' + columnCaser(field) + '`';
          columns.push(column);
        });
        lines.push('KEY `' + name + '` (' + columns.join(',') + ')');
      });
    }
    sql += lines.join(',\n  ');
    sql += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8';

    function createTable(onSuccess) {
      self.query(sql, function (err) {
        if (err) {
          self.logger.error('[Ormy] Failed to create table ' + model.table.cyan + '.\n' + sql);
          throw err;
        }
        else if (onSuccess) {
          onSuccess();
        }
        else {
          self.logger.info('[Ormy] Created table: ' + model.table.cyan + '.');
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
        self.logger.log('[Ormy] Table ' + model.table.cyan + ' is up-to-date.');
      }
      else if (model.forceSync) {
        console.log(oldSql);
        console.log(sql);
        // TODO: Alter table instead of re-creating.
        self.query('DROP TABLE `' + model.table + '`', function (err) {
          if (err) {
            self.logger.error('[Ormy] Failed to drop table ' + model.table.cyan + '.');
            throw err;
          }
          else {
            createTable(function () {
              self.logger.info('[Ormy] Dropped and re-created table ' + model.table.cyan + '.');
            });
          }
        });
      }
      else {
        // TODO: Show diff.
        self.logger.warn('[Ormy] Table ' + model.table.cyan + ' is out of date.');
      }
    });
  }

});
