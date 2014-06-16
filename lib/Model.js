var cluster = require('cluster');
var ormy = require('../ormy');
var Class = require('./Class');

/**
 * A Model deals with data.
 */
var Model = module.exports = Class.extend({

  init: function init(db, config) {
    var model = this;
    for (var property in config) {
      model[property] = config[property];
    }
    var allFields = {};
    var columnFields = model.columnFields = {};
    [
      config.beforeFields,
      config.fields,
      config.afterFields
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

  beforeFields: {
    id: {type: 'id', autoIncrement: true, primary: true}
  },

  afterFields: {
    created: {type: 'created'},
    modified: {type: 'modified'}
  },

  enableSync: true,

  forceSync: false,

  create: function create(items, callback) {
    var model = this;
    var db = model.db;
    var isArray = items instanceof Array;
    if (!isArray) {
      items = [items];
    }
    db.create(this, items, function (err, items) {
      if (err) {
        db.logger.error('[Ormy] Failed to insert an item into "' + model.table + '"', err);
        callback(err);
      }
      else {
        if (callback) {
          if (!isArray) {
            items = items[0];
          }
          callback(null, items);
        }
      }
    });
  },

  find: function find(fields, where, limit, callback) {
    this.db.find(this, fields, where, limit, callback);
  },

  get: function get(where, callback) {
    if (!isNaN(where)) {
      where = {id: where};
    }
    this.db.find(this, where, 1, callback);
  }

});

Model.underscored = function (string) {
  return string.replace(/([a-z]*)([A-Z])/g, function (match, lower, upper) {
    return lower + (lower ? '_' : '') + upper.toLowerCase();
  });
};
