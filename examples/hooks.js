var nock = require('nock')
var theon = require('..')

// Set up mock
nock('http://my.api.com')
  .get('/api/users/123')
  .matchHeader('Version', '1.0')
  .reply(200, [{
    id: '123',
    username: 'foo'
  }])

var client = theon('http://my.api.com')

var users = client
  .basePath('/api')
  .set('Version', '1.0')
  .collection('users')
  .basePath('/users')
  .resource('get')
  .path('/:id')

// Attach a default observer for all the requests
users
  .observe('after response', function (req, res, next) {
    console.log('Log response:', res.statusCode, res.headers)
    next()
  })

// Render the API client
var api = users.renderAll()

api
  .users
  .get()
  .param('id', 123)
  // Attach an observer for the current request at API client level
  .observe('after response', function (req, res, next) {
    console.log('Log body:', res.body)
    next()
  })
  .end(function (err, res) {
    console.log('Done!')
  })
