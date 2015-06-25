/**
 * An Audit Model is used to record all insert/update/delete operations that
 * happen in other models. There should only be one audit model per database
 */

var Model = require(__dirname + '/model')

var AuditModel = module.exports = Model.extend({
  /**
   * Assign this instance to db.auditModel so it will be used.

   */
  init: function (db) {
    var self = this
    var audit = db.config.audit
    var name = typeof audit === 'string' ? audit : 'audits'
    Model.call(self, db, name)

    // A database only has one AuditModel.
    db.auditModel = self
  },

  /**
   * Remember the who/what/when of each change.
   */
  fields: {
    operation: "enum('INSERT','UPDATE','DELETE')",
    tableName: 'string',
    itemId: 'id',
    itemJson: 'text',
    changeTime: 'datetime',
    userId: 'id'
  },

  /**
   * Don't automatically have "created" and "modified" fields.
   */
  afterFields: {},

  /**
   * Make sure an audit model's table exists.
   */
  enableSync: true,

  /**
   * Maintain indexes for a variety of use-cases.
   */
  indexes: [

    // Incremental synchronization.
    ['changeTime'],

    // User-specific "recycle bin" for each type of item.
    ['userId', 'operation', 'tableName', 'changeTime'],

    // Item history.
    ['tableName', 'itemId', 'changeTime']
  ]

})
