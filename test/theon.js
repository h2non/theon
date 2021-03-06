const nock = require('nock')
const sinon = require('sinon')
const expect = require('chai').expect
const stream = require('stream')
const theon = require('..')
const pkg = require('../package.json')

suite('theon', function () {
  beforeEach(function () {
    nock.cleanAll()
  })

  test('api', function () {
    expect(theon).to.be.a('function')
    expect(theon.engine).to.be.an('object')
    expect(theon.agents).to.be.an('object')
    expect(theon.Context).to.be.a('function')
    expect(theon.Dispatcher).to.be.a('function')
    expect(theon.entities.Entity).to.be.a('function')
    expect(theon.entities.Client).to.be.a('function')
    expect(theon.entities.Resource).to.be.a('function')
    expect(theon.entities.Collection).to.be.a('function')
  })

  test('version', function () {
    expect(theon.VERSION).to.be.equal(pkg.version)
  })

  test('root parent', function () {
    var client = theon('http://localhost')
      .collection('foo')
      .resource('bar')
      .resource('boo')

    var api = client.render()

    expect(api.foo.bar.boo().root)
      .to.have.property('ctx')
      .to.have.property('opts')
      .to.have.property('rootUrl')
      .to.be.equal('http://localhost')
  })

  test('expose public engine client DSL', function () {
    var client = theon('http://localhost')
      .collection('foo')
      .resource('bar')
      .resource('boo')

    var api = client.render()
    var publicApi = api.foo.bar.boo().api

    expect(publicApi).to.have.property('foo').to.be.a('function')
    expect(publicApi.foo).to.have.property('bar').to.be.a('function')
    expect(publicApi.foo.bar).to.have.property('boo').to.be.a('function')
  })

  test('collection entity constructor arguments', function () {
    var client = theon('http://localhost')
      .collection('foo')
      .useConstructor(function (path) {
        this.basePath(path)
      })
      .resource('bar')
      .resource('boo')

    var api = client.render()
    var collection = api.foo('/foo')
    var publicApi = collection.bar.boo().api

    expect(publicApi).to.have.property('foo').to.be.a('function')
    expect(collection._client.ctx).to.have.property('opts').to.be.an('object')
    expect(collection._client.ctx.opts).to.have.property('basePath').to.be.equal('/foo')
    expect(publicApi.foo).to.have.property('bar').to.be.a('function')
    expect(publicApi.foo.bar).to.have.property('boo').to.be.a('function')
  })

  test('multiple entity decorators with arguments', function () {
    var client = theon('http://localhost')
      .collection('foo')
      .decorate(function (delegate) {
        return function (path) {
          var instance = delegate()
          var collection = instance._client
          collection.basePath(path)
          return instance
        }
      })
      .decorate(function (delegate) {
        return function (path) {
          var instance = delegate(path)
          var collection = instance._client
          var basePath = collection.ctx.opts.basePath
          collection.basePath(basePath + path)
          return instance
        }
      })
      .resource('bar')
      .resource('boo')

    var api = client.render()
    var collection = api.foo('/foo')
    var publicApi = collection.bar.boo().api

    expect(collection._client.ctx).to.have.property('opts').to.be.an('object')
    expect(collection._client.ctx.opts).to.have.property('basePath').to.be.equal('/foo/foo')
    expect(collection).to.have.property('bar').to.be.a('function')
    expect(collection.bar).to.have.property('boo').to.be.a('function')

    expect(publicApi).to.have.property('foo').to.be.a('function')
    expect(publicApi.foo).to.have.property('bar').to.be.a('function')
    expect(publicApi.foo.bar).to.have.property('boo').to.be.a('function')
  })

  test('cancellable request', function (done) {
    nock('http://localhost')
      .get('/boo')
      .delayConnection(1000)
      .reply(200, { hello: 'world' })

    var client = theon('http://localhost')
      .resource('boo')
      .path('/boo')
      .render()

    client
      .boo()
      .observe('dialing', function (req, res, next) {
        next('stop')
      })
      .end(function (err, res) {
        expect(err.message).to.be.equal('Request aborted: stop')
        expect(res.statusCode).to.be.equal(0)
        done()
      })
  })

  test('writable stream', function (done) {
    var spy = sinon.spy()
    var writable = new stream.Writable()
    writable._write = function (chunk, encoding, next) {
      spy(JSON.parse(chunk.toString()))
      next()
    }

    nock('http://localhost')
      .get('/foo')
      .reply(200, {hello: 'world'})

    var client = theon('http://localhost')
      .resource('foo')
      .path('/foo')
      .render()

    client.foo()
      .pipe(writable)
      .end(function (err, res) {
        expect(err).to.be.null
        expect(spy.args[0][0]).to.be.deep.equal({ hello: 'world' })
        done()
      })
  })

  test('readable stream', function (done) {
    var readable = new stream.Readable()
    readable._read = function (chunk, encoding, next) {
      readable.push('{"hello":"world"}')
      readable.push(null)
    }

    nock('http://localhost')
      .post('/foo', { hello: 'world' })
      .reply(200, { hello: 'world' })

    var client = theon('http://localhost')
      .type('json')
      .resource('foo')
      .path('/foo')
      .method('POST')
      .render()

    client.foo()
      .stream(readable)
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(res.body).to.be.deep.equal({ hello: 'world' })
        done()
      })
  })

  test('context store', function (done) {
    nock('http://localhost')
      .get('/foo')
      .reply(200, { hello: 'world' })

    var spy = sinon.spy()
    var client = theon('http://localhost')
      .type('json')

    client.store.set('foo', 'bar')

    var api = client
      .resource('foo')
      .path('/foo')
      .render()

    api.foo()
      .use(function (req, res, next) {
        req.store.set('boo', 'foo')
        next()
      })
      .use(function (req, res, next) {
        spy(req.store.get('foo'))
        spy(req.store.get('boo'))
        next()
      })
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(spy.args).to.have.length(2)
        expect(spy.args[0][0]).to.be.equal('bar')
        expect(spy.args[1][0]).to.be.equal('foo')
        expect(res.req.store.get('foo')).to.be.equal('bar')
        expect(res.req.store.get('boo')).to.be.equal('foo')
        done()
      })
  })

  test('promise', function (done) {
    nock('http://localhost')
      .get('/foo')
      .reply(200, { hello: 'world' })

    var api = theon('http://localhost')
      .type('json')
      .resource('foo')
      .path('/foo')
      .render()

    api.foo()
      .then(function (res) {
        expect(res.statusCode).to.be.equal(200)
        done()
      })
      .catch(function (err) {
        expect(err).to.be.null
        done(err)
      })
  })

  test('promise with error', function (done) {
    nock('http://localhost')
      .get('/')
      .reply(400, { hello: 'world' })

    var api = theon('http://localhost')
      .type('json')
      .resource('foo')
      .path('/foo')
      .render()

    api.foo()
      .catch(function (err) {
        expect(err.status).to.be.equal(404)
        done()
      })
  })

  test('hooks', function (done) {
    nock('http://localhost')
      .get('/foo')
      .reply(200, { hello: 'world' })

    var spy = sinon.spy()
    var client = theon('http://localhost')
      .type('json')
      .resource('foo')
      .path('/foo')
      .render()

    var disabledHooks = [
      'error'
    ]

    var enabledHooks = [
      'before',
      'before request',
      'before middleware request',
      'middleware request',
      'after middleware request',
      'before validator request',
      'validator request',
      'after validator request',
      'after request',
      'before dial',
      'dialing',
      'after dial',
      'before response',
      'before middleware response',
      'middleware response',
      'after middleware response',
      'before validator response',
      'validator response',
      'after validator response',
      'after response',
      'after'
    ]

    var req = client.foo()

    enabledHooks.forEach(function (event) {
      req.observe(event, track(event))
    })

    disabledHooks.forEach(function (event) {
      req.observe(event, function (req, res, next) {
        next(new Error('Hook ' + event + ' should not be dispatched'))
      })
    })

    req
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(res.body).to.be.deep.equal({ hello: 'world' })
        expect(spy.args).to.have.length(enabledHooks.length)
        done()
      })

    function track (event) {
      return function (req, res, next) {
        spy(event, req, res)
        next()
      }
    }
  })

  test('hooks inheritance', function (done) {
    nock('http://localhost')
      .get('/foo')
      .reply(200, { hello: 'world' })

    var spy = sinon.spy()
    var client = theon('http://localhost')
      .type('json')
      .observe('before', track)
      .resource('foo')
      .path('/foo')
      .observe('before', track)
      .render()

    client.foo()
      .observe('before', track)
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(res.body).to.be.deep.equal({ hello: 'world' })
        expect(spy.calledThrice).to.be.true
        done()
      })

    function track (req, res, next) {
      spy(req, res)
      next()
    }
  })

  test('hooks by entity', function (done) {
    nock('http://localhost')
      .get('/foo')
      .reply(200, { hello: 'world' })

    var spy = sinon.spy()
    var client = theon('http://localhost')
      .type('json')
      .observeEntity('before', function () {
        throw new Error('Parent entity hook should not be called')
      })
      .resource('foo')
      .observeEntity('before', track)
      .path('/foo')
      .render()

    client.foo()
      .observeEntity('before', track)
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(res.body).to.be.deep.equal({ hello: 'world' })
        expect(spy.calledOnce).to.be.true
        done()
      })

    function track (req, res, next) {
      spy(req, res)
      next()
    }
  })

  test('mixin', function (done) {
    nock('http://localhost')
      .get('/foo')
      .reply(200, { hello: 'world' })

    var client = theon('http://localhost')
      .type('json')
      .resource('foo')
      .mixin('mixin', mixin)
      .render()

    function mixin (url) {
      expect(this.name).to.be.equal('mixin')
      expect(this.root).to.be.an('object')
      expect(this.parent).to.be.an('object')
      expect(this.parent.name).to.be.equal('foo')
      this.root.url(url)
      expect(this.root.ctx.opts.rootUrl).to.be.equal('http://foo')
      done()
    }

    client.foo.mixin('http://foo')
  })

  test('nested urls', function (done) {
    nock('http://bar')
      .get('/')
      .reply(200, { hello: 'bar' })

    nock('http://foo')
      .get('/')
      .delayConnection(100)
      .reply(200, { hello: 'foo' })

    var client = theon()
      .type('json')

    client
      .resource('foo')
      .url('http://foo')

    client
      .resource('bar')
      .url('http://bar')

    var api = client.render()

    api
      .foo()
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(res.body).to.be.deep.equal({ hello: 'foo' })
      })

    api
      .bar()
      .end(function (err, res) {
        expect(err).to.be.null
        expect(res.statusCode).to.be.equal(200)
        expect(res.body).to.be.deep.equal({ hello: 'bar' })
        done()
      })
  })

  test('featured client', function (done) {
    var spy = sinon.spy()

    nock('http://localhost', { reqheaders: { Version: '1.0' } })
      .get('/api/users/123')
      .reply(200, [{
        id: '123',
        username: 'foo'
      }])

    var client = theon('http://localhost')
      .basePath('/api')
      .set('Version', '1.0')
      .use(function (req, res, next) {
        spy(req)
        next()
      })

    var collection = client
      .collection('users')
      .basePath('/users')
      .use(function (req, res, next) {
        spy(req)
        next()
      })

    var action = collection
      .action('create')
      .method('POST')
      .mixin('validate', function (opts) {
        spy(opts)
        expect(this).to.be.equal(action)
        return opts
      })
      .use(function (req, res, next) {
        spy(req)
        next()
      })

    collection
      .resource('get')
      .alias('find')
      .path('/:id')
      .method('GET')
      .use(function (req, ctx, next) {
        spy(req)
        next()
      })

    var cli = client.render()

    expect(cli.users.create).to.be.a('function')
    expect(cli.users.create.validate).to.be.a('function')

    var opts = {}
    expect(cli.users.create.validate(opts)).to.be.equal(opts)

    function testModel (body, req, res) {
      return {
        get: function (name) {
          return body[0][name]
        }
      }
    }

    cli
      .users
      .get()
      .validate(function (err) {
        expect(err).to.be.empty
      })
      .param('id', 123)
      .type('json')
      .model(testModel)
      .use(function (req, res, next) {
        spy(req)
        next()
      })
      .param('id', 123)
      .end(function (err, res) {
        expect(err).to.be.null
        expect(spy.args).to.have.length(5)
        expect(res.statusCode).to.be.equal(200)
        expect(res.body[0].id).to.be.equal('123')
        expect(res.body[0].username).to.be.equal('foo')

        expect(res.model.get('id')).to.be.equal('123')
        expect(res.model.get('username')).to.be.equal('foo')

        done(err)
      })
  })
})
