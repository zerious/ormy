var Flagger = require('../common/event/flagger')
require('../common/string/colors')
require('../common/json/stringify')

/**
 * A Database is a connection that allows models to be defined and used.
 */
var Database = module.exports = Flagger.extend({
  /**
   * Configure the Database, then make a connection.
   */
  init: function (config) {
    var self = this
    self.configure(config)

    // Set up defaults for retries, timeouts, and error handling.
    self.fn = config.fn || {
        retries: 2, // Allow 2 retries after the first try.
        delay: 1e3, // Wait 1 second between retries.
        timeout: 6e4, // Time out after 1 minute.
        error: function (e) {
          if (e) {
            if (e.message && this.sql) {
              e.message += '\nSQL: ' + JSON.stringify(this.sql) + '$1'
            }
            self.log.error('[Ormy] ' + e.stack)
          }
        }
    }

    // Log when connected.
    self.when('connected', function () {
      var now = Date.now()
      // But don't log more than once a second.
      if (now > self.connectedAt + 1e3) {
        self.log.info('[Ormy] Connected to ' + config.name.cyan + ' database.')
      }
      self.connectedAt = now
    })

    self.connectedAt = 0
    self.connect()

    if (config.audit) {
      setImmediate(function () {
        var AuditModel = require(__dirname + '/audit-model')
        var DbAuditModel = self.Model.extend(AuditModel).extend({
          table: (config.audit === true ? 'audits' : config.audit)
        })
        var model = self.auditModel = new DbAuditModel(self)
      })
    }
  },

  configure: function (config) {
    var self = this
    self.config = config
    self.log = config.log || console
    self.app = config.app || 0
    self.name = config.name
    config.host = config.host || '127.0.0.1'
    config.user = config.user || config.username || 'root'
    config.password = config.password || config.pass || ''
    config.database = config.database || config.name
    config.tableCase = config.tableCase || 'snake'
    config.columnCase = config.columnCase || 'snake'
  },

  /**
   * Expose an adapter-specific Field constructor.
   */
  Field: require(__dirname + '/field'),

  /**
   * Maintain references to a database's models.
   */
  models: [],

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
   * Specific Database types must override the connect method.
   */
  connect: function () {
    throw new Error('[Ormy] Database.prototype.connect should be overridden.')
  },

  /**
   * Close the database connection.
   */
  close: function () {
    var self = this
    self.connection.close()
  },

  /**
   * Query the database with SQL and a fn.
   */
  query: function (sql, fn) {
    var self = this
    return self.connection.query(sql, fn)
  },

  /**
   * Define a new model.
   */
  define: function (properties) {
    var self = this
    var DefineModel = self.Model.extend(properties)
    return new DefineModel(this)
  },

  /**
   * Find one or more results.
   */
  find: function (model, options, fn) {
    var self = this

    var fields = options.fields
    var table = model.table
    var where = options.where
    var filters = options.filters
    var limit = options.limit
    var order = options.order

    var columns = []
    if (fields) {
      if (typeof fields === 'string') {
        fields = fields.split(/\*,\*/g)
      }
      fields.forEach(function (name) {
        var field = model.fields[name]
        if (field) {
          columns.push(field.as)
        } else {
          throw new Error('Unknown field: "' + name + '".')
        }
      })
    } else {
      fields = model.fields
      for (var fieldName in fields) {
        columns.push(fields[fieldName].as)
      }
    }

    fields = columns.join(',')

    where = this.getWhereSql(model, filters, where)

    var max = require('../ormy')._MAX_RESULTS
    if (typeof limit === 'number') {
      limit = Math.min(limit, max)
    } else if (limit instanceof Array) {
      limit = Math.max(limit[0], 0) + ',' + Math.min(limit[1], max)
    } else {
      limit = max
    }

    var select = (options.distinct ? 'SELECT DISTINCT ' : 'SELECT ')

    var sql = select + fields +
      ' FROM ' + model.table + where +
      ' LIMIT ' + limit

    return self.query(sql, fn)
  },

  /**
   * Create an item in the database.
   */
  create: function (model, item, fn) {
    var self = this
    var sql = 'INSERT INTO ' + model.table + self.getSetSql(model, item, 'create')

    // Decorate the new item.
    self.query(sql, function (error, result) {
      self.decorateItem(model, item)
      item.id = result.insertId
      if (fn) {
        fn(error, item)
      }
      if (self.auditModel && (model !== self.auditModel)) {
        self.audit('INSERT', model, item)
      }
    })
  },

  /**
   * Update an item in the database.
   */
  update: function (model, item, fn) {
    var self = this
    var id = item.id * 1
    delete item.id
    var sql = 'UPDATE ' + model.table +
      self.getSetSql(model, item, 'save', 'id') +
      self.getWhereSql(model, {id: id})

    // Decorate the updated item.
    self.query(sql, function (error, item) {
      self.decorateItem(model, item)
      item.id = id
      if (fn) {
        fn(error, item)
      }
      if (self.auditModel) {
        self.audit('UPDATE', model, item)
      }
    })
  },

  /**
   * Decorate an item with methods.
   */
  decorateItem: function (model, item) {
    var self = this

    for (var key in item) {
      var field = model.fields[key]
      var value = item[key]
      if (field && (field.type === 'datetime')) {
        if (value && !(value instanceof Date)) {
          item[key] = new Date(value)
        }
      }
    }

    if (!item.save) {
      Object.defineProperty(item, 'save', {
        enumerable: false,
        value: function (fn) {
          if (item.id) {
            self.update(model, item, {id: item.id}, fn)
          }
        }
      })
    }

    if (!item.remove) {
      Object.defineProperty(item, 'remove', {
        enumerable: false,
        value: function (fn) {
          if (item.id) {
            self.delete(model, {id: item.id}, fn)
          }
        }
      })
    }
  },

  /**
   * Remove an item from the database.
   */
  'delete': function (model, filters, fn) {
    var self = this
    var from = ' FROM ' + model.table + self.getWhereSql(model, filters)

    // Audit the delete, or just run it.
    if (self.auditModel) {
      // TODO: Use transactions if the adapter supports them.
      self.query('SELECT *' + from, function (e, items) {
        if (items) {
          items.forEach(function (item) {
            self.audit('DELETE', model, item, fn)
          })
          self.query('DELETE ' + from, fn)
        }
      })
    } else {
      self.query('DELETE ' + from, fn)
    }
  },

  /**
   * Remember an operation in case it needs to be reversed or something.
   */
  audit: function (operation, model, item, fn) {
    var self = this

    fn = fn || 0
    var response = fn.response || 0
    var request = response.request || 0
    var session = request.session || 0
    var userId = session.userId || fn.userId || 0

    self.create(self.auditModel, {
      userId: userId,
      operation: operation,
      tableName: model.table,
      itemId: item.id,
      itemJson: JSON.stringify(item),
      changeTime: new Date()
    }, fns.ignore)
  },

  /**
   * Get a SQL clause for setting columns to an item's values.
   */
  getSetSql: function (model, item, mode, exclude) {
    var sql = ' SET '
    var sets = []
    for (var fieldName in item) {
      var field = model.fields[fieldName]
      if (field && (fieldName !== exclude)) {
        var value = item[fieldName]
        if (item[fieldName] === null) {
          sets.push(field.column + '=NULL')
        } else {
          if (value instanceof Date) {
            value = value.toISOString().substr(0, 19).replace('T', ' ')
          }
          value = ('' + value).replace(/'/g, "\'")
          sets.push('`' + field.column + "`='" + value + "'")
        }
      }
    }
    if (model.createdField && (mode === 'create')) {
      sets.push('`' + model.createdField.name + '`' + '=NOW()')
    }
    if (model.modifiedField) {
      sets.push('`' + model.modifiedField.name + '`' + '=NOW()')
    }
    return ' SET ' + sets.join(',')
  },

  /**
   * Escape a value's single quotes and surround it with single quotes.
   */
  quote: function (value) {
    if (typeof value === 'string') {
      value = value.replace(/'/g, "\'")
    }
    return "'" + value + "'"
  },

  /**
   * Escape a value's single quotes and surround it with single quotes.
   */
  quoteColumn: function (value) {
    if (typeof value === 'string') {
      value = value.replace(/`/g, '\\`')
    }
    return '`' + value + '`'
  },

  /**
   * Get a SQL WHERE clause for SELECT, UPDATE or DELETE statement.
   */
  getWhereSql: function (model, filters, where) {
    var self = this
    var conditions = []
    for (var fieldName in filters) {
      var field = model.fields[fieldName]
      if (field) {
        var column = field.column
        var value = filters[fieldName]
        var condition = null
        if (value instanceof Array) {
          var operator = value[0]
          if (/^(=|!=|<|>|<=|>=|LIKE|NOT LIKE)$/i.test(operator)) {
            condition = '`' + column + '`' + ' ' + operator + ' ' + self.quote(value[1])
          } else if (/^(IS NULL|IS NOT NULL)$/i.test(operator)) {
            condition = '`' + column + '`' + ' ' + operator
          } else if (operator === 'BETWEEN') {
            condition = '`' + column + '`' + ' BETWEEN ' + self.quote(value[1]) + ' AND ' + self.quote(value[2])
          } else if (operator === 'IN') {
            condition = '`' + column + '`' + ' IN (' + value[1].join(',') + ')'
          }
        } else {
          condition = '`' + column + '`' + '=' + self.quote(value)
        }
        if (condition) {
          conditions.push(condition)
        }
      }
    }
    if (where) {
      conditions.push(where)
    }
    return ' WHERE ' + (conditions.join(' AND ') || 1)
  }

})
