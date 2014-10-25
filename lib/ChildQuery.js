var Database = require('./Database');
var fs = require('fs');

var sqlDB = Database.extend({
    // NPM module for the database driver.
  driverName: 'sql.js',

  // Field sub-class.
  fieldClassName: 'Sqlite3Field',

  connect: function (callback) {
    var db = this;
    var config = db.config;
    config.path = config.path || ':memory:';
    var dbbuffer  = undefined;
    if (config.path !== ':memory:') {
      try {
        dbbuffer = fs.readFileSync(config.path);
      } catch (e) {
        // file IO exception
        process.send({
          msg: "doneConnect",
          error: e
        });
        callback(e);
        return;
      }
    }

    console.log('child connecting');
    db.connection = new db.driver.Database(dbbuffer);

    callback(null);
    return;
  },
  query: function (data, cb) {
    var rows = [];
    this.connection.each(data.sql, function cb(row) {
      rows.push(row);
    }, function done() {
      cb(rows);
    });
  }
});

var sql;

process.on('message', function (data) {
  if (data.msg === 'queryWorker') {
    sql.query(data, function (rows) {
      process.send({
        sql: data.sql,
        rows: rows
      });
    });
  } else if ( data.msg === 'newConnect') {
    var temp;
    if (sql) {
      temp = sql;
    } else {
      sql = new sqlDB(data.config);
    }
    sql.connect(function () {
      if (temp) {
        temp.connection.close();
        console.log('closed');
      }
      process.send({
        msg: "doneConnect"
      });
    });
  }
});

process.on("close", function (code, signal) {
  console.log("connection closed ", code, signal);
});