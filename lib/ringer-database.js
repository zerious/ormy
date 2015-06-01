var Database = require(__dirname + '/database');
var caser = require('../common/string/caser');

/**
 * A Ringer Database stores data on a cluster of application servers.
 */
var RingerDatabase = module.exports = Database.extend({

  /**
   * Override the base Model functionality.
   */
  Model: require(__dirname + '/ringer-model'),

  /**
   * Connect to Ringer.
   */
  connect: function () {
    var self = this;
    setImmediate(function () {
      self.ring = self.app.rings[self.name];
      self.setFlag('connected');
    });
  },

  /**
   * TODO: Implement schema version upgrades.
   */
  sync: function () {}

});
