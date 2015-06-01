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
  }

});
