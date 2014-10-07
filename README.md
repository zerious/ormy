# <a href="http://lighter.io/ormy" style="font-size:40px;text-decoration:none;color:#000"><img src="https://cdn.rawgit.com/lighterio/lighter.io/master/public/ormy.svg" style="width:90px;height:90px"> Ormy</a>
[![NPM Version](//img.shields.io/npm/v/ormy.svg)](https://npmjs.org/package/ormy)
[![Downloads](//img.shields.io/npm/dm/ormy.svg)](https://npmjs.org/package/ormy)
[![Build Status](//img.shields.io/travis/lighterio/ormy.svg)](https://travis-ci.org/lighterio/ormy)
[![Code Coverage](//img.shields.io/coveralls/lighterio/ormy/master.svg)](https://coveralls.io/r/lighterio/ormy)
[![Dependencies](//img.shields.io/david/lighterio/ormy.svg)](https://david-dm.org/lighterio/ormy)
[![Support](//img.shields.io/gratipay/Lighter.io.svg)](https://gratipay.com/Lighter.io/)

Ormy is a Node.js Object Relational Mapping library. It currently supports
MySQL and Sqlite3.

## Getting started

Get a new database connection.

```javascript
var db = require('ormy')(
  type: 'mysql',
  host: 'localhost'
  port: 3306,
  user: 'root',
  pass: 'my_password',
  name: 'my_db'
});

var User = db.define({
  table: 'users',
  fields: {
    email: 'string',
    firstName: 'string',
    lastName: 'string'
  },
  methods: {
    hello: function () {
      return 'Hello, ' + this.firstName + '!';
    }
  }
});

User.create({
  email: 'ormy@lighter.io',
  firstName: 'Ormy',
  lastName: 'Team'
}, function (err, item) {
  console.log('Created item: ', item);
});

User.create([{
  email: 'ormy@lighter.io',
  firstName: 'Ormy',
  lastName: 'Team'
}, {
  email: 'ligher@lighter.io',
  firstName: 'Lighter',
  lastName: 'Team'
}], function (err, items) {
  console.log('Created array of items: ', items);
});

User.get(1, function (err, item) {
  console.log('User with ID 1: ', item);
});

User.get({email: 'ormy@lighter.io'}, function (err, item) {
  console.log('User with Ormy Email: ', item);
});

User.find({lastName: "Team"}, function (err, items) {
  console.log('"Team" users: ', items);
  items.forEach(function (item) {
    item.lastName = 'Core';
    item.save();
  })
});


```

[![NPM Version](//img.shields.io/npm/v/ormy.svg) ![Downloads](//img.shields.io/npm/dm/ormy.svg)](https://npmjs.org/package/ormyormy)
[![Build Status](//img.shields.io/travis/lighterio/ormy.svg)](https://travis-ci.org/lighterio/ormy)
[![Code Coverage](//img.shields.io/coveralls/lighterio/ormy/master.svg)](https://coveralls.io/r/lighterio/ormy)
[![Dependencies](//img.shields.io/david/lighterio/ormy.svg)](https://david-dm.org/lighterio/ormy)
[![Support](//img.shields.io/gratipay/Lighter.io.svg)](https://gratipay.com/Lighter.io/)
