'use strict';
var Class = require('./Class');

/**
 * A Field is part of a model.
 */
var Field = module.exports = Class.extend({

  init: function init(model, config, name) {
    var field = this;
    if (typeof config === 'string') {
      config = {type: config};
    }
    field.name = name;
    field.model = model;
    field.column = model.nameColumn(name);

    for (var key in config) {
      field[key] = config[key];
    }

    // Wrappting field column name with ` so that column names can be more permissive
    field.as = '`' + field.column + '`' + (field.column === name ? '' : ' as ' + name);
  }
});
