var cluster = require('cluster');
var ormy = require('../ormy');
var Flagger = require('../common/event/flagger');
var caser = require('../common/string/caser');

/**
 * A Model deals with data.
 */
var Model = module.exports = Flagger.extend({

  init: function (db, name) {
    var self = this;
    var allFields = {};
    var columnFields = self.columnFields = {};
    self.db = self.db || db;
    self.name = self.name || name;
    self.table = self.table || caser[db.config.tableCase](self.name);
    db.models.push(self);
    [
      self.beforeFields || db.beforeFields,
      self.fields,
      self.afterFields || db.afterFields
    ].forEach(function (fields) {
      if (fields) {
        for (var name in fields) {
          var field = new db.Field(self, fields[name], name);
          allFields[name] = field;
          columnFields[field.column] = field;
          if (field.type == 'created') {
            self.createdField = field;
          }
          if (field.type == 'modified') {
            self.modifiedField = field;
          }
          if (field.type == 'deleted') {
            self.deletedField = field;
          }
        }
      }
    });
    self.fields = allFields;
    delete self.beforeFields;
    delete self.afterFields;
    if (self.enableSync || self.forceSync) {
      if (cluster.isMaster || (cluster.worker.id == 1)) {
        self.sync(function () {});
      }
    }
  },

  enableSync: true,

  forceSync: false,

  save: function (item, fn) {
    var self = this;
    var method = item.id ? 'update' : 'create';
    return self.db[method](self, item, fn);
  },

  find: function (options, fn) {
    var self = this;
    return self.db.find(this, options, fn);
  },

  each: function (options, fn) {
    var then;
    var self = this;
    setImmediate(function () {
      return self.db.find(self, options, function (err, results) {
        if (err) throw err;
        if (results.length) {
          results.forEach(fn);
        }
        if (then) {
          then();
        }
      });
    });

    return {then: function (fn) { then = fn; }};
  },

  get: function (idOrFilters, fn) {
    var filters = isNaN(idOrFilters) ? idOrFilters : {id: idOrFilters};
    return this.db.find(this, {filters: filters, limit: 1}, function (err, results) {
      fn(err, results ? results[0] : null);
    });
  },

  remove: function (id, fn) {
    return this.db.delete(this, {id: id}, fn);
  },

  /**
   * Synchronize a model by creating or re-creating its table.
   * TODO: ALTER TABLE instead of re-creating.
   */
  sync: function (fn) {
    var self = this;
    var db = self.db;
    db.syncing++;
    var done = function (err) {
      if (!--db.syncing) {
        db.setFlag('synced');
      }
      fn(err);
    };
    var sql = 'CREATE TABLE `' + self.table + '` (\n  ';
    var lines = [];
    var pKeys = [];
    for (var name in self.fields) {
      var field = self.fields[name];
      lines.push(field.getCreateSql());
      if (field.primary) {
        pKeys.push(field.column);
      }
    }
    if (pKeys.length) {
      lines.push('PRIMARY KEY (`' + pKeys.join('`,`') + '`)');
    }
    var columnCaser = caser[self.columnCase];
    if (self.indexes) {
      self.indexes.forEach(function (fields) {
        var name = columnCaser(fields.join(' '));
        var columns = [];
        fields.forEach(function (field) {
          var column = '`' + columnCaser(field) + '`';
          columns.push(column);
        });
        lines.push('KEY `' + name + '` (' + columns.join(',') + ')');
      });
    }
    if (self.fullText) {
      self.fullText.forEach(function (fields) {
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
      db.query(sql, function (err) {
        if (err) {
          db.log.error('[Ormy] Failed to create table ' + self.table + '.\n' + sql);
          done(err);
        }
        else {
          var op = isNew ? 'Created' : 'Dropped and re-created';
          db.log.info('[Ormy] ' + op + ' table: ' + self.table.cyan + '.');
          done();
        }
      });
    }

    db.query('SHOW CREATE TABLE `' + self.table + '`', function (err, result) {

      var oldSql = (result ? result[0]['Create Table'] : '')
        .replace(/ AUTO_INCREMENT=[0-9]+/, '')
        .replace(/(DEFAULT '\d+)\.0+'/, "$1'");

      if (!oldSql) {
        createTable(true);
      }
      else if (sql == oldSql) {
        db.log.log('[Ormy] Table ' + self.table.cyan + ' is up-to-date.');
        done();
      }
      else if (self.forceSync) {
        db.query('DROP TABLE `' + self.table + '`', function (err) {
          if (err) {
            db.log.error('[Ormy] Failed to drop table ' + self.table + '.');
            done(err);
          }
          else {
            createTable();
          }
        });
      }
      else {
        // TODO: Show diff.
        db.log.warn('[Ormy] Table ' + self.table + ' is out of date.');
        done();
      }
    });
  }

});
