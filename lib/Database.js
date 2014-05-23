var Class = require('./Class');
var Model = require('./Model');

/**
 * A Database is a connection that allows models to be defined.
 */
var Database = module.exports = Class.extend({

  init: function init(config) {
    this.config = config;
    var log = this.logger = config.logger || console;

    config.host = config.host || '127.0.0.1';
    config.user = config.user || 'root';
    config.pass = config.pass || '';

    // Get the npm module for this database type.
    var type = config.type;
    this.driver = require(type);

    // Ensure this DB instantiates fields whose types the DBMS understands.
    var capType = type[0].toUpperCase() + type.substr(1);
    this.Field = require('./' + capType + 'Field');

    this.connect(function (err) {
      if (err) {
        log.error('Failed to connect to "' + config.name + '" database.');
      }
      else {
        log.info('Connected to "' + config.name + '" database');
      }
    });
  },

  // MySQL works this way, and others probably do too.
  query: function query(sql, callback) {
    this.connection.query(sql, callback);
    this.lastSql = sql;
  },

  // Define a new .
  define: function define(config) {
    var db = this;
    return new Model(db, config);
  },

  find: function find(model, fields, where, limit, callback) {
    var db = this;
    if (fields instanceof Array) {
      var columns = [];
      fields.forEach(function (field) {
        var column = model.fields[field].column;
        if (column) {
          columns.push(column);
        }
        else {
          db.logger.error('Unknown field: "' + field + '".');
          db.logger.log('Model fields:', model.fields);
        }
      });
      fields = columns.join(',');
    }
    else {
      callback = limit;
      limit = where;
      where = fields;
      fields = '*';
    }

    var sql = 'SELECT ' + fields + ' FROM ' + model.table;
    if (typeof where == 'object') {
      sql += this.getWhereSql(model, where);
    } else {
      callback = limit;
      limit = where;
    }

    var ormy = require('../ormy');
    if (typeof limit == 'number') {
      limit = Math.min(limit, ormy._MAX_RESULTS);
    }
    else if (limit instanceof Array) {
      limit = limit[0] + ',' + Math.min(limit[1], ormy._MAX_RESULTS);
    }
    else {
      callback = limit;
      limit = ormy._MAX_RESULTS;
    }
    sql += ' LIMIT ' + limit;
    this.query(sql, function (err, results) {
      if (!err) {
        results.forEach(function (result) {
          db.itemify(model, result);
        });
      }
      callback(err, results);
    });
  },

  create: function create(model, items, callback) {
    var db = this;
    var count = 0;
    items.forEach(function (item) {
      var sql = 'INSERT INTO ' + model.table +
          db.getSetSql(model, item, 'create');
      db.query(sql, function (err, result) {
        if (err) {
          callback(err);
          db.logger.log('SQL: ' + sql);
        }
        else {
          item.id = result.insertId;
          db.itemify(model, item);
          if (++count == items.length) {
            callback(null, items);
          }
        }
      });
    });
  },

  itemify: function itemify(model, item) {
    var db = this;
    item.save = function (callback) {
      if (item.id) {
        db.update(model, item, {id: item.id}, callback);
      }
    };
    item.remove = function (callback) {
      if (item.id) {
        db.delete(model, {id: item.id}, callback);
      }
    };
  },

  update: function update(model, data, where, callback) {
    var sql = 'UPDATE ' + model.table +
        this.getSetSql(model, data, 'save', 'id') +
        this.getWhereSql(model, where);
    this.query(sql, callback);
  },

  "delete": function remove(model, where, callback) {
    var sql = 'DELETE FROM ' + model.table +
        this.getWhereSql(model, where);
    this.query(sql, callback);
  },

  getSetSql: function getSetSql(model, item, exclude) {
    var sql = ' SET ';
    var sets = [];
    for (var key in item) {
      var field = model.fields[key];
      if (field && (key != exclude)) {
        var value = ('' + item[key]).replace(/'/g, "\\'");
        sets.push(field.column + "='" + value + "'");
      }
    }
    sql += sets.join(',');
    return sql;
  },

  getWhereSql: function getWhereSql(model, where) {
    var sql = '';
    for (var key in where) {
      var field = model.fields[key];
      if (field) {
        sql += (sql ? ' AND ' : ' WHERE ');
        var value = '' + where[key];
        var operator;
        if (value instanceof Array) {
          operator = ' ' + value[0] + ' ';
          value = '' + value[1];
        }
        else {
          operator = '=';
        }
        sql += field.column + operator + "'" + value.replace(/'/g, "\\'") + "'";
      }
    }
    return sql;
  }

});
