var plans = require('plans');
var mysql = require('mysql');
var Database = require(__dirname + '/database');
var caser = require('../common/string/caser');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  /**
   * A MySQL database uses MySQL fields.
   */
  Field: require(__dirname + '/mysql-field'),

  /**
   * Connect to a MySQL database using a connection pool.
   */
  connect: function () {
    var self = this;
    self.connection = mysql.createPool(self.config);
    self.connection.on('connection', function () {
      self.setFlag('connected');
    });
  },

  /**
   * Synchronize a model by creating or re-creating its table.
   * TODO: ALTER TABLE instead of re-creating.
   */
  sync: function (model, plan) {
    var self = this;
    self.syncing++;
    plan = self.makePlan(plan);
    plans.run(function (end) {
      var done = function (err) {
        if (!--self.syncing) {
          self.setFlag('synced');
        }
        end(err);
      };
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
      if (model.fullText) {
        model.fullText.forEach(function (fields) {
          var name = columnCaser(fields.join(' '));
          var columns = [];
          fields.forEach(function (field) {
            var column = '`' + columnCaser(field) + '`';
            columns.push(column);
          });
          lines.push('FULLTEXT KEY `' + name + '` (' + columns.join(',') + ')');
        });
      }
      sql += lines.join(',\n  ');
      sql += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8';

      function createTable(isNew) {
        self.query(sql, function (err) {
          if (err) {
            self.log.error('[Ormy] Failed to create table ' + model.table + '.\n' + sql);
            done(err);
          }
          else {
            var op = isNew ? 'Created' : 'Dropped and re-created';
            self.log.info('[Ormy] ' + op + ' table: ' + model.table.cyan + '.');
            done();
          }
        });
      }

      self.query('SHOW CREATE TABLE `' + model.table + '`', function (err, result) {

        var oldSql = (result ? result[0]['Create Table'] : '')
          .replace(/ AUTO_INCREMENT=[0-9]+/, '')
          .replace(/(DEFAULT '\d+)\.0+'/, "$1'");

        if (!oldSql) {
          createTable(true);
        }
        else if (sql == oldSql) {
          self.log.log('[Ormy] Table ' + model.table.cyan + ' is up-to-date.');
          done();
        }
        else if (model.forceSync) {
          Log(sql, oldSql);
          self.query('DROP TABLE `' + model.table + '`', function (err) {
            if (err) {
              self.log.error('[Ormy] Failed to drop table ' + model.table + '.');
              done(err);
            }
            else {
              createTable();
            }
          });
        }
        else {
          // TODO: Show diff.
          self.log.warn('[Ormy] Table ' + model.table + ' is out of date.');
          done();
        }
      });
    }, plan);
  }

});
