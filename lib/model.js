var cluster = require('cluster');
var plans = require('plans');
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
        db.sync(self);
      }
    }
  },

  enableSync: true,

  forceSync: false,

  save: function (item, plan) {
    var self = this;
    var method = item.id ? 'update' : 'create';
    return self.db[method](self, item, plan);
  },

  find: function (options, plan) {
    var self = this;
    return self.db.find(this, options, plan);
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

    return {then: function (plan) { then = plan; }};
  },

  get: function (idOrFilters, plan) {
    var filters = isNaN(idOrFilters) ? idOrFilters : {id: idOrFilters};
    return this.db.find(this, {filters: filters, limit: 1}, function (err, results) {
      plan(err, results ? results[0] : null);
    });
  },

  remove: function (id, plan) {
    return this.db.delete(this, {id: id}, plan);
  }

});
