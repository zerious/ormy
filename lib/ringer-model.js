var Model = require(__dirname + '/model');

/**
 * A Ringer model stores data across a cluster of application hosts.
 */
var RingerModel = module.exports = Model.extend({

  /**
   * Initialize the model, waiting for ring connection and stabilization.
   */
  init: function (db, name) {
    var self = this;
    self.db = self.db || db;
    self.name = self.name || name;
    db.when('connected', function () {
      db.ring.when('stabilized', function () {
        self.initSequence();
      });
    });
  },

  /**
   * Get client-assigned sequence info so IDs can auto-increment in blocks.
   */
  initSequence: function () {
    var self = this;
    var ring = self.db.ring;
    var key = self.name + '.sequence';

    // Get sequence information from this client.
    ring.getValue(key, function (value) {

      if (value) {
        ring.leader.socket.send(key, function (value) {
          if (value) {

          }
        });
      }
    });
  }

});
