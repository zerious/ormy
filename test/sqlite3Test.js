var ormy = require('../ormy');
var Model = require('../lib/Model');

describe('ormy sqlite3', function () {
  var db = ormy({
    type: 'sqlite3',
    path: ':memory:',
    name: 'attribution_shared'
  });
  var Mock = db.define({
    table: 'mocks',
    fields: {
      name: 'string',
      deleted: 'deleted',
      number: 'int',
      tiny: 'tinyint',
      big: 'bigint',
      small: 'smallint',
      money: 'money',
      enums: 'enum("this","is","important")'
    },
    nameColumn: Model.underscored,
    nameTable: Model.underscored,
    enableSync: false
  });

  it('should create table', function (done) {
    db.sync(Mock, done);
  });

  it('should update table', function (done) {
    db.sync(Mock, done);
  });

  it('should create a first record', function (done) {
    var expected = { name: 'what is this', number: 12, tiny: 1, big: 1, small: 1, big: 1, money: 10.20, enums: 'is', id: 1};
    Mock.save({ name: 'what is this', number: 12, tiny: 1, big: 1, small: 1, big: 1, money: 10.20, enums: 'is'}, function (err, item) {
      is.null(err);
      // delete created, modified, deleted columns since it is dynamic
      ['deleted', 'created', 'modified']
      .forEach(function (key) {
        delete item[key];
      });
      is.same(expected, item);
      done();
    });
  });

  it('should get a first record', function (done) {
    var expected = { id: 1, name: 'what is this', number: 12, tiny: 1, big: 1, small: 1, big: 1, money: 10.20, enums: 'is'};
    Mock.get(1, function (err, item) {
      is.null(err);
      // delete created, modified, deleted columns since it is dynamic
      ['deleted', 'created', 'modified']
      .forEach(function (key) {
        delete item[key];
      });
      is.same(expected, item);
      done();
    });
  });

  it('should update a first record', function (done) {
    Mock.get(1, function (err, item) {
      is.null(err);
      var old = item.modified;
      var beforeUpdate = item;
      beforeUpdate.number = 24;
      Mock.save(beforeUpdate, function (err, afterUpdate) {
        is.null(err);
        is.same(beforeUpdate.number, afterUpdate.number);
        done();
      });
    });
  });

  it('should remove a first record', function (done) {
    Mock.remove(1, function (err) {
      is.null(err);
      Mock.get(1, function (err, item) {
        is.null(err);
        is.undefined(item);
        done();
      });
    });
  })
});
