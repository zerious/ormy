var Field = require('./Field');

/**
 * A Field is part of a model.
 */
var MysqlField = module.exports = Field.extend({

  getCreateSql: function getCreateSql() {
    var type = this.type;
    // var length = this.length;
    var autoIncrement = this.autoIncrement;
    var notNull = this.primary || this.notNull;
    var unsigned = this.unsigned;
    var value = this.default;

    // Ormy types.
    if (type == 'id') {
      type = 'integer';
      unsigned = true;
      if (this.primary) {
        autoIncrement = true;
      }
    }
    else if (type === 'money') {
      type = 'numeric';
    }
    else if (type === 'created' || type === 'modified' || type === 'deleted') {
      type = 'datetime';
    }
    else if (type === 'string') {
      type = 'text';
    } else if (/^enum+(.*)/.test(type)) {
      type = 'text';
    }

    // Sqlite3 defaults
    ['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal']
    .some(function (numeric) {
      if (numeric === type) {
        type = 'numeric';
        return true;
      }
      return false;
    });


    if (value) {
      value = "'" + ('' + value).replace(/'/g, "\\'") + "'";
    }
    else if (!notNull && !/text|blob/.test(type)) {
      value = 'NULL';
    }

    return '`' + this.column + '` ' + type +
      (notNull && !autoIncrement ? ' NOT NULL' : '')+
      (value ? ' DEFAULT ' + value : '');
  }

});
