var Class = require('./Class');

/**
 * A Field is part of a model.
 */
var Field = module.exports = Class.extend({

  init: function init(model, config, name) {
    if (typeof config == 'string') {
      config = {type: config};
    }
    this.name = name;
    this.model = model;
    this.column = model.nameColumn(name);

    for (var key in config) {
      this[key] = config[key];
    }
  }

});
