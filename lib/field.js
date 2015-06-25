var Type = require('../common/object/type')
var caser = require('../common/string/caser')

/**
 * A Field is part of a model.
 */
var Field = module.exports = Type.extend({
  init: function (model, config, name) {
    var self = this
    if (typeof config === 'string') {
      config = {type: config}
    }
    self.name = name
    self.model = model
    self.column = caser[model.columnCase || 'snake'](name)

    for (var key in config) {
      self[key] = config[key]
    }

    // Store a backtick-wrapped "as" for name-safety and concatenation speed.
    self.as = '`' + self.column + '`' + (self.column === name ? '' : ' as ' + name)
  }
})
