var Field = require(__dirname + '/field')

/**
 * A Field is part of a model.
 */
var MysqlField = module.exports = Field.extend({
  getCreateSql: function () {
    var type = this.type
    var length = this.length
    var autoIncrement = this.autoIncrement
    var notNull = this.primary || this.notNull
    var unsigned = this.unsigned
    var value = this.default

    // Ormy types.
    if (type === 'id') {
      type = 'int'
      unsigned = true
      if (this.primary) {
        autoIncrement = true
      }
    } else if (type === 'money') {
      type = 'decimal'
    } else if (type === 'created' || type === 'modified' || type === 'deleted') {
      type = 'datetime'
    } else if (type === 'string') {
      type = 'varchar'
    }

    // MySQL defaults.
    if (type === 'tinyint') {
      length = length || 4
    } else if (type === 'smallint') {
      length = length || 6
    } else if (type === 'mediumint') {
      length = length || 9
    } else if (type === 'int') {
      length = length || 11
    } else if (type === 'bigint') {
      length = length || 20
    } else if (type === 'decimal') {
      length = length || '20,2'; // 100 quadrillion dollars & cents = 20 digits.
    } else if (type === 'varchar') {
      length = length || 255
    }

    if (value) {
      value = "'" + ('' + value).replace(/'/g, "\'") + "'"
    } else if (!notNull && !/text|blob/.test(type)) {
      value = 'NULL'
    }

    return '`' + this.column + '` ' + type
      + (length ? '(' + length + ')' : '')
      + (unsigned ? ' unsigned' : '')
      + (notNull ? ' NOT NULL' : '')
      + (value ? ' DEFAULT ' + value : '')
      + (autoIncrement ? ' AUTO_INCREMENT': '')
  }

})
