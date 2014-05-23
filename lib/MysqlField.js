var Field = require('./Field');

/**
 * A Field is part of a model.
 */
var MysqlField = module.exports = Field.extend({

  getCreateSql: function getCreateSql() {
    var type = this.type;
    var length = this.length;
    var autoIncrement = this.autoIncrement
    var notNull = this.primary || this.notNull;
    var unsigned = this.unsigned;
    var value = this.default;

    if (type == 'id') {
      type = 'int';
      length = length || 11;
      unsigned = true;
      if (this.primary) {
        autoIncrement = true;
      }
    }
    else if (type == 'created' || type == 'modified') {
      type = 'datetime';
    }
    else if (type == 'string') {
      type = 'varchar';
      length = length || 255;
    }

    if (value) {
      value = "'" + ('' + value).replace(/'/g, "\\'") + "'";
    }
    else if (!notNull && !/text|blob/.test(type)) {
      value = 'NULL';
    }

    return '`' + this.column + '` ' + type +
      (length ? '(' + length + ')' : '') +
      (unsigned ? ' unsigned' : '') +
      (notNull ? ' NOT NULL' : '')+
      (value ? ' DEFAULT ' + value : '')+
      (autoIncrement ? ' AUTO_INCREMENT': '');
  }

});
