/**
 * Connect to a SQLite Database in a seperate process, and send data
 * via stdin, stderr and stdout to avoid blocking the parent process.
 */
var Database = require('sql.js').Database;
var fs = require('fs');
var args = process.argv;
var path = args[args.length - 1];
var data = (path == ':memory:' ? undefined : fs.readFileSync(path));
var db = new Database(data);

// Decorate the JSON object for streaming.
require('../common/json/read-stream');
require('../common/json/write-stream');

var input = JSON.readStream(process.stdin, 'query');
var output = JSON.writeStream(process.stdout);

input.on('query', function (pair) {
  var id = pair[0];
  var sql = pair[1];
  var result = [];
  var statement;
  try {
    if (sql instanceof Array) {
      db.run(sql[0]);
      statement = db.prepare(sql[1]);
      sql = sql.join(';')
    }
    else {
      statement = db.prepare(sql);
    }
    while (statement.step()) {
      var item = statement.getAsObject();
      result.push(item);
    }
    statement.free();
  }
  catch (e) {
    e.stack = (e.stack || '').replace(/(\n|$)/, '$1SQL: "' + sql + '"\n');
    result = e;
  }
  output.write([id, result]);
});

setInterval(function () {}, 9e9);