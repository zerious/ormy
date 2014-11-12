var cluster = require('cluster');
var ormy = require('../ormy');
var Type = require('../common/object/type');

/**
 * A Model deals with data.
 */
var Model = module.exports = Type.extend({

  init: function init(db, config) {
    var model = this;
    model.db = db;
    for (var property in config) {
      model[property] = config[property];
    }
    var allFields = {};
    var columnFields = model.columnFields = {};
    [
      config.beforeFields || db.beforeFields,
      config.fields,
      config.afterFields || db.afterFields
    ].forEach(function (fields) {
      if (fields) {
        for (var name in fields) {
          var field = new db.Field(model, fields[name], name);
          allFields[name] = field;
          columnFields[field.column] = field;
          if (field.type == 'created') {
            model.createdField = field;
          }
          if (field.type == 'modified') {
            model.modifiedField = field;
          }
          if (field.type == 'deleted') {
            model.deletedField = field;
          }
        }
      }
    });
    model.fields = allFields;
    delete model.beforeFields;
    delete model.afterFields;
    if (model.enableSync || model.forceSync) {
      if (cluster.isMaster || (cluster.worker.id == 1)) {
        db.sync(model);
      }
    }
  },

  enableSync: true,

  forceSync: false,

  save: function save(item, callback) {
    var model = this;
    var db = model.db;
    var method = item.id ? 'update' : 'create';
    db[method](model, item, function (err, item) {
      if (err) {
        db.logger.error('[Ormy] Failed to ' + method + ' an item in "' + model.table + '"', err);
        callback(err);
      }
      else if (callback) {
        callback(null, item);
      }
    });
  },

  find: function find(options, callback) {
    this.db.find(this, options, callback);
  },

  each: function each(options, callback) {
    var then;
    var self = this;
    setImmediate(function () {
      self.db.find(self, options, function (err, results) {
        if (err) throw err;
        if (results.length) {
          results.forEach(callback);
        }
        if (then) {
          then();
        }
      });
    });

    // TODO: Implement real promises.
    return {then: function (callback) { then = callback; }};
  },

  get: function get(idOrFilters, callback) {
    var filters = isNaN(idOrFilters) ? idOrFilters : {id: idOrFilters};
    this.db.find(this, {filters: filters, limit: 1}, function (err, results) {
      callback(err, results ? results[0] : null);
    });
  },

  remove: function remove(id, callback) {
    this.db.delete(this, {id: id}, callback);
  }

});

Model.underscored = function (string) {
  return string.replace(/([a-z]*)([A-Z])/g, function (match, lower, upper) {
    return lower + (lower ? '_' : '') + upper.toLowerCase();
  });
};
