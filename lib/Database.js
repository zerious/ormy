var Class = require('./Class');
var Model = require('./Model');

/**
 * A Database is a connection that allows models to be defined and used.
 */
var Database = module.exports = Class.extend({

  /**
   * Database drivers like "mysql" extend Database, as in MysqlDatabase.
   */
  driverName: 'abstract',

  /**
   * Different drivers can use custom Field classes.
   */
  fieldClassName: 'Field',

  /**
   * Standard fields to be prepended.
   */
  beforeFields: {
    id: {type: 'id', autoIncrement: true, primary: true}
  },

  /**
   * Standard fields to be appended.
   */
  afterFields: {
    created: {type: 'created'},
    modified: {type: 'modified'}
  },

  /**
   * Initialize the database by making a connection.
   */
  init: function init(config) {
    var db = this;
    db.config = config;
    var log = db.logger = config.logger || console;

    config.host = config.host || '127.0.0.1';
    config.user = config.user || 'root';
    config.pass = config.pass || '';
    config.plan = config.plan || {
      error: function (e) {
        db.logger.error(e);
      }
    };
    config.retries = config.retries || 3;

    // Get the npm module for this database type.
    db.driver = require(db.driverName);

    // Ensure this DB instantiates fields whose types the DBMS understands.
    db.Field = require('./' + db.fieldClassName);

    var handleConnection = function (err) {
      if (err) {
        log.error('[Ormy] Failed to connect to "' + config.name + '" database.');
        setTimeout(function () {
          db.connect(handleConnection);
        }, 1e3);
      }
      else {
        log.info('[Ormy] Connected to "' + config.name + '" database.');
      }
    };
    db.connect(handleConnection);
  },

  /**
   * Query the database with SQL, assuming MySQL for now.
   */
  query: function query(sql, callback) {
    this.connection.query(sql, function (err, results) {
      if (err) {
        err.sql = sql;
      }
      callback(err, results);
    });
  },

  /**
   * Define a new model.
   */
  define: function define(config) {
    var db = this;
    return new Model(db, config);
  },

  /**
   * Find one or more results.
   */
  find: function find(model, options, callback) {
    var db = this;

    var fields = options.fields;
    var table = model.table;
    var where = options.where;
    var filters = options.filters;
    var limit = options.limit;

    var columns = [];
    if (fields) {
      if (typeof fields === 'string') {
        fields = fields.split(/\*,\*/g);
      }
      fields.forEach(function (name) {
        var field = model.fields[name];
        if (field) {
          columns.push(field.as);
        }
        else {
          db.logger.error('[Ormy] Unknown field: "' + name + '".');
          db.logger.log('[Ormy] Model fields:', model.fields);
        }
      });
    }
    else {
      fields = model.fields;
      for (var fieldName in fields) {
        columns.push(fields[fieldName].as);
      }
    }

    fields = columns.join(',');

    where = this.getWhereSql(model, filters, where);

    var max = require('../ormy')._MAX_RESULTS;
    if (typeof limit === 'number') {
      limit = Math.min(limit, max);
    }
    else if (limit instanceof Array) {
      limit = Math.max(limit[0], 0) + ',' + Math.min(limit[1], max);
    }
    else {
      limit = max;
    }

    var sql = 'SELECT ' + fields +
      ' FROM ' + model.table + where +
      ' LIMIT ' + limit;
    db.query(sql, function (err, items) {
      if (!err) {
        items.forEach(function (item, index) {
          db.decorateItem(model, item);
        });
      }
      callback(err, items);
    });
  },

  /**
   * Create an item in the database.
   */
  create: function create(model, item, callback) {
    var db = this;
    var sql = 'INSERT INTO ' + model.table + db.getSetSql(model, item, 'create');
    db.query(sql, function (err, item) {
      if (err) {
        callback(err);
        db.logger.log('[Ormy] Query failed: ' + sql);
      }
      else {
        db.decorateItem(model, item);
        item.id = item.insertId;
        delete item.insertId;
        callback(null, item);
      }
    });
  },

  /**
   * Update an item in the database.
   */
  update: function update(model, item, callback) {
    var db = this;
    var id = item.id * 1;
    delete item.id;
    var sql = 'UPDATE ' + model.table +
        db.getSetSql(model, item, 'save', 'id') +
        db.getWhereSql(model, {id: id});
    db.query(sql, function (err) {
      if (err) {
        callback(err);
        db.logger.log('[Ormy] Query failed: ' + sql);
      }
      else {
        db.decorateItem(model, item);
        item.id = id;
        callback(null, item);
      }
    });
  },

  /**
   * Decorate an item with methods.
   */
  decorateItem: function decorateItem(model, item) {
    var db = this;
    Object.defineProperty(item, 'save', {
      enumerable: false,
      value: function (callback) {
        if (item.id) {
          db.update(model, item, {id: item.id}, callback);
        }
      }
    });
    Object.defineProperty(item, 'remove', {
      enumerable: false,
      value: function (callback) {
        if (item.id) {
          db.delete(model, {id: item.id}, callback);
        }
      }
    });
  },

  "delete": function remove(model, filters, callback) {
    var db = this;
    var sql = 'DELETE FROM ' + model.table +
        db.getWhereSql(model, filters);
    db.query(sql, callback);
  },

  getSetSql: function getSetSql(model, item, mode, exclude) {
    var sql = ' SET ';
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
      sets.push('`' + model.createdField.name +'`' + "=NOW()");
    }
    if (model.modifiedField) {
      sets.push('`' + model.modifiedField.name + '`'+ "=NOW()");
    }
    return ' SET ' + sets.join(',');
  },

  quote: function quote(value) {
    if (typeof value === 'string') {
      value = value.replace(/'/g, "\\'");
    }
    return "'" + value + "'";
  },

  getWhereSql: function getWhereSql(model, filters, where) {
    var db = this;
    var conditions = [];
    for (var fieldName in filters) {
      var field = model.fields[fieldName];
      if (field) {
        var column = field.column;
        var value = filters[fieldName];
        var condition = null;
        if (value instanceof Array) {
          var operator = value[0];
          if (/^(=|!=|<|>|<=|>=|LIKE|NOT LIKE)$/i.test(operator)) {
            condition = '`' + column + '`' + ' ' + operator + ' ' + db.quote(value[1]);
          }
          else if (/^(IS NULL|IS NOT NULL)$/i.test(operator)) {
            condition = '`' + column + '`' + ' ' + operator;
          }
          else if (operator === 'BETWEEN') {
            condition = '`' + column + '`' + ' BETWEEN ' + db.quote(value[1]) + ' AND ' + db.quote(value[2]);
          }
          else if (operator === 'IN') {
            condition = '`' + column + '`' + ' IN (' + value[1].join(',') + ')';
          }
        }
        else {
          condition = '`' + column + '`' + '=' + db.quote(value);
        }
        if (condition) {
          conditions.push(condition);
        }
      }
    }
    if (where) {
      conditions.push(where);
    }
    return ' WHERE ' + (conditions.join(' AND ') || 1);
  }

});
