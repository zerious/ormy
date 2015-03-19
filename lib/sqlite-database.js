var plans = require('plans');
var spawn = require('child_process').spawn;
require('../common/json/read-stream');
require('../common/json/write-stream');
var Database = require(__dirname + '/database');

/**
 * A SqliteDatabase connects to SQLite.
 */
var SqliteDatabase = module.exports = Database.extend({

  /**
   * A Sqlite database uses Sqlite fields.
   */
  Field: require(__dirname + '/sqlite-field'),

  // Assign IDs to queries so their results can be received.
  queryId: 0,

  // Hang onto query plans until we receive results.
  queryFns: {},

  /**
   * "Connect" by spawning a worker process.
   */
  connect: function () {
    var self = this;
    var config = self.config || 0;

    // Spawn a SQLite process, with a path (or a "0" indicating a blank DB).
    self.worker = spawn(process.execPath, [
      __dirname + '/sqlite-spawn.js',
      config.path || 0
    ], {stdio: 'pipe'});

    // If we receive output on stderr, the process may have failed.
    self.worker.stderr.on('data', function (data) {
      data = '' + data;
      if (/^execvp\(\)/.test(data)) {
        self.log.warn('[Ormy] Failed to spawn SQLite worker.', data);
      }
    });

    // Get query results from the worker's stdout.
    self.input = JSON.readStream(self.worker.stdout, 'results');
    self.output = JSON.writeStream(self.worker.stdin);

    // When we get results, call the function that requested them.
    self.input.on('results', function (pair) {
      var id = pair[0];
      var result = pair[1];
      var fn = self.queryFns['_' + id];
      if (fn) {
        fn(result);
        delete self.queryFns[id];
      }
    });

    // Consider the database to be connected.
    self.setFlag('connected');
  },

  /**
   * Query by writing SQL to the worker process's stdin.
   */
  query: function (sql, plan) {
    var self = this;
    plan = self.makePlan(plan);
    plans.run(function (done) {
      var id = ++self.queryId;
      self.queryFns['_' + id] = done;
      self.output.write([id, sql]);
    }, plan);
  },

  /**
   * @Override function getSetSql(model, item, mode, exclude)
   */
  getSetSql: function (model, item, mode, exclude) {
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

  /**
   * Get the values for the fields in an item.
   */
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
   * Execute an INSERT then a SELECT synchronously to retrieve the ID.
   */
  create: function (model, item, plan) {
    var self = this;
    self.query(
      [
        'INSERT INTO ' + model.table + self.getFieldValues(model, item, 'create'),
        'SELECT last_insert_rowid() as id'
      ],
      function (err, items) {
        if (err) {
          plan(err);
        }
        else {
          self.decorateItem(model, item);
          item.id = items && items[0] ? items[0].id : undefined;
          plan(null, item);
        }
      }
    );
  },

  /**
   * @Override function update (model, item, plan)
   */
  update: function (model, item, plan) {
    var self = this;
    var id = item.id * 1;
    delete item.id;
    var sql = 'UPDATE ' + model.table +
      self.getSetSql(model, item, 'save', 'id') +
      self.getWhereSql(model, {id: id});
    self.query(sql, function (err) {
      if (err) {
        plan(err);
      }
      else {
        self.decorateItem(model, item);
        item.id = id;
        plan(null, item);
      }
    });
  },

  sync: function (model, plan) {
    var self = this;
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
        lines.push('PRIMARY KEY (`' + pKeys.join('`, `') + '`)');
      }
      sql += lines.join(',\n  ');
      sql += '\n)';

      function createTable(isNew) {
        self.query(sql, function (err) {
          if (err && !/already exists/.test(err.message)) {
            self.log.error('[Ormy] Failed to create table: "' + model.table + '".\n' + sql);
            done(err);
          }
          else {
            var op = isNew ? 'Created' : 'Dropped and re-created';
            self.log.info('[Ormy] ' + op + ' table: "' + model.table + '".');
            done();
          }
        });
      }

      self.query('SELECT sql FROM SQLITE_MASTER WHERE type=\'table\' AND tbl_name=\'' + model.table + '\'', function (err, result) {
        var oldSql = (result && result[0] ? result[0]['sql']: '')
          .replace(/ AUTOINCREMENT=[0-9]+/, '');

        if (!oldSql) {
          createTable(true);
        }
        else if (sql === oldSql) {
          self.log.log('[Ormy] Table "' + model.table + '" is up-to-date.');
          done();
        }
        else if (model.forceSync) {
          // TODO: Alter table instead of re-creating.
          self.query('DROP TABLE `' + model.table + '`', function (err) {
            if (err) {
              self.log.error('[Ormy] Failed to drop table "' + model.table + '".');
              done(err);
            }
            else {
              self.connection.run();
              createTable();
            }
          });
        }
        else {
          // TODO: Show diff.
          self.log.warn('[Ormy] Table "' + model.table + '" is out of date.');
          done();
        }
      });
    }, plan);
  }

});
