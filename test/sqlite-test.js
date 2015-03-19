var up = __dirname.replace(/[\/\\][^\/\\]+$/, '');
var ormy = require(up + '/ormy');
var Model = require(up + '/lib/model');

describe('SQLite', function () {
  var log = {
    error: mock.concat(),
    warn: mock.concat(),
    info: mock.concat(),
    log: mock.concat()
  };
  var db = ormy({
    adapter: 'sqlite',
    path: ':memory:',
    name: 'test',
    log: log
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
      is.falsy(err);
      // delete created, modified, deleted columns since it is dynamic
      ['deleted', 'created', 'modified']
      .forEach(function (key) {
        delete item[key];
      });
      is.same(item, expected);
      done();
    });
  });

  it('should get a first record', function (done) {
    var expected = { id: 1, name: 'what is this', number: 12, tiny: 1, big: 1, small: 1, big: 1, money: 10.20, enums: 'is'};
    Mock.get(1, function (err, item) {
      is.falsy(err);
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
      is.falsy(err);
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
      is.falsy(err);
      Mock.get(1, function (err, item) {
        is.falsy(err);
        is.undefined(item);
        done();
      });
    });
  })
});
