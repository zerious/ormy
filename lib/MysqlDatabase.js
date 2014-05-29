var Database = require('./Database');

/**
 * A MysqlDatabase connects to MySQL.
 */
var MysqlDatabase = module.exports = Database.extend({

  // NPM module for the database driver.
  driverName: 'mysql',

  // Field sub-class.
  fieldClassName: 'MysqlField',

  connect: function connect(callback) {
    var db = this;
    var config = db.config;
    db.connection = db.driver.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.user,
      password: config.pass,
      database: config.name
    });
    db.connection.connect(callback);
    db.connection.on('error', function (err) {
      if (err.code == 'PROTOCOL_CONNECTION_LOST') {
        setImmediate(function () {
          db.connect(callback);
        });
      }
      else {
        throw err;
      }
    });
  },

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
          db.logger.error('Failed to create table: "' + model.table + '".');
        }
        else if (onSuccess) {
          onSuccess();
        }
        else {
          db.logger.info('Created table: "' + model.table + '".');
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
        db.logger.log('Table "' + model.table + '" is up-to-date.');
      }
      else if (model.forceSync) {
        db.query('DROP TABLE `' + model.table + '`', function (err) {
          if (err) {
            db.logger.error('Failed to drop table "' + model.table + '".');
          }
          else {
            createTable(function () {
              db.logger.info('Dropped and re-created table "' + model.table + '".');
            });
          }
        });
      }
      else {
        db.logger.warn('Table "' + model.table + '" is out of date.');
      }
    });
  }

});
