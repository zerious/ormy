var plans = require('plans');
var Flagger = require('../common/event/flagger');
var Model = require(__dirname + '/Model');

/**
 * A Database is a connection that allows models to be defined and used.
 */
var Database = module.exports = Flagger.extend({

  /**
   * Different Database types can use custom Field classes.
   */
  fieldTypeName: 'Field',

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
   * Configure the Database, then make a connection.
   */
  init: function (config) {
    var self = this;
    self.config = config;
    self.logger = config.logger;
    config.host = config.host || '127.0.0.1';
    config.user = config.user || config.username || 'root';
    config.password = config.password || config.pass || '';
    config.database = config.database || config.name;

    // Set up defaults for retries, timeouts, and error handling.
    self.plan = config.plan || {
      tries: 3, // Allow 2 retries after the first try.
      retryDelay: 1e3, // Wait 1 second before retries.
      timeout: 6e4, // Time out after 1 minute.
      error: function (e) {
        if (e.message && this.sql) {
          e.message += '\nSQL: ' + JSON.stringify(this.sql) + '$1';
        }
        self.logger.error('[Ormy!] ' + e.stack);
      }
    };

    // Ensure this Database instantiates its own Field types.
    self.Field = require('./' + self.fieldTypeName);

    // Log when connected.
    self.on('connected', function () {
      self.logger.info('[Ormy] Connected to "' + config.name + '" database.');
    });

    self.connect();
  },

  /**
   * Specific Database types must override the connect method.
   */
  connect: function () {
    throw new Error('[Ormy] Database.prototype.connect should be overridden.');
  },

  /**
   * Close the database connection.
   */
  close: function () {
    var self = this;
    self.connection.close();
  },

  /**
   * Query the database with SQL and a plan.
   */
  query: function (sql, plan) {
    var self = this;
    plan.base = self.plan;
    plan.sql = sql;
    plans.run(function (done) {
      self.connection.query(sql, done);
    }, plan);
  },

  /**
   * Define a new model.
   */
  define: function (config) {
    var self = this;
    return new Model(self, config);
  },

  /**
   * Find one or more results.
   */
  find: function (model, options, plan) {
    var self = this;

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
          throw new Error('Unknown field: "' + name + '".');
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

    var select = (options.distinct ? 'SELECT DISTINCT ' : 'SELECT ');

    var sql = select + fields +
      ' FROM ' + model.table + where +
      ' LIMIT ' + limit;

    plans.before(plan, 'ok', function (items) {
      items.forEach(function (item, index) {
        self.decorateItem(model, item);
      });
    });

    self.query(sql, plan);
  },

  /**
   * Create an item in the database.
   */
  create: function (model, item, plan) {
    var self = this;
    var sql = 'INSERT INTO ' + model.table + self.getSetSql(model, item, 'create');

    // Before running "ok", decorate the new item.
    plan = plans.before(plan, 'ok', function (item) {
      self.decorateItem(model, item);
      item.id = item.insertId;
      delete item.insertId;
      if (self.auditTable) {
        self.audit('insert', model.table, item.id, item);
      }
    });

    self.query(sql, plan);
  },

  /**
   * Update an item in the database.
   */
  update: function (model, item, plan) {
    var self = this;
    var id = item.id * 1;
    delete item.id;
    var sql = 'UPDATE ' + model.table +
      self.getSetSql(model, item, 'save', 'id') +
      self.getWhereSql(model, {id: id});

    // Before running "ok", decorate the updated item.
    plan = plans.before(plan, 'ok', function (item) {
      self.decorateItem(model, item);
      item.id = id;
      if (self.auditTable) {
        self.audit('update', model.table, id, item);
      }
    });

    self.query(sql, plan);
  },

  /**
   * Decorate an item with methods.
   */
  decorateItem: function (model, item) {
    var self = this;

    for (var key in item) {
      var field = model.fields[key];
      var value = item[key];
      if (field && (field.type === 'datetime')) {
        if (value && !(value instanceof Date)) {
          item[key] = new Date(value);
        }
      }
    }

    if (!item.save) {
      Object.defineProperty(item, 'save', {
        enumerable: false,
        value: function (plan) {
          if (item.id) {
            self.update(model, item, {id: item.id}, plan);
          }
        }
      });
    }

    if (!item.remove) {
      Object.defineProperty(item, 'remove', {
        enumerable: false,
        value: function (plan) {
          if (item.id) {
            self.delete(model, {id: item.id}, plan);
          }
        }
      });
    }
  },

  "delete": function (model, filters, plan) {
    var self = this;
    var from = ' FROM ' + model.table + self.getWhereSql(model, filters);

    // Audit the delete, or just run it.
    if (self.auditTable) {
      // TODO: Use a transaction if the Database supports it.
      self.query('SELECT *' + from, function (e, rows) {
        if (rows) {
          rows.forEach(function (row) {
            self.audit('delete', model.table, row.id, row);
          });
          self.query('DELETE ' + from, plan);
        }
      });
    }
    else {
      self.query('DELETE ' + from, plan);
    }
  },

  getSetSql: function (model, item, mode, exclude) {
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

  quote: function (value) {
    if (typeof value === 'string') {
      value = value.replace(/'/g, "\\'");
    }
    return "'" + value + "'";
  },

  getWhereSql: function (model, filters, where) {
    var self = this;
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
            condition = '`' + column + '`' + ' ' + operator + ' ' + self.quote(value[1]);
          }
          else if (/^(IS NULL|IS NOT NULL)$/i.test(operator)) {
            condition = '`' + column + '`' + ' ' + operator;
          }
          else if (operator === 'BETWEEN') {
            condition = '`' + column + '`' + ' BETWEEN ' + self.quote(value[1]) + ' AND ' + self.quote(value[2]);
          }
          else if (operator === 'IN') {
            condition = '`' + column + '`' + ' IN (' + value[1].join(',') + ')';
          }
        }
        else {
          condition = '`' + column + '`' + '=' + self.quote(value);
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
