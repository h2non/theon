(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.theon = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = function (req, res, done) {
  var client = require('lil-http')
  return client(req, function (err, _res) {
    done(err, responseAdapter(res, _res))
  })
}

function responseAdapter(res, _res) {
  // Expose the agent-specific response
  res.setOriginalResponse(_res)

  // Define recurrent HTTP fields
  res.setStatus(_res.status)
  res.setStatusText(_res.statusText)
  res.setHeaders(_res.headers)

  // Define body, if present
  if (_res.data) res.setBody(_res.data)

  return res
}

},{"lil-http":21}],2:[function(require,module,exports){
var isBrowser = typeof window !== 'undefined'

exports.browser = {
  embed: require('./browser/lil')
}

exports.node = {
  embed: require('./node/request')
}

var agents = isBrowser
  ? exports.browser
  : exports.node

exports.get = function (name) {
  return name
    ? agents[name]
    : agents.embed
}

exports.defaults = function () {
  return exports.get()
}

exports.add = function (name, agent) {
  agents[name] = agent
}

},{"./browser/lil":1,"./node/request":3}],3:[function(require,module,exports){
module.exports = function (req, res, cb) {
  var request = require('request')
  req.json = true

  return request(req, function (err, res, body) {
    if (err) return cb(err, res)
    if (body) res.body = body
    cb(err, res)
  })
}

},{"request":20}],4:[function(require,module,exports){
module.exports = Builder

var entities = ['collections', 'resources']

function Builder(client) {
  this.parent = client
  this.client = new Client(client)
}

Builder.prototype.render = function () {
  var parent = this.parent

  entities.forEach(function (kind) {
    parent[kind].forEach(this.renderMembers, this)
  }, this)

  return this.client
}

Builder.prototype.renderMembers = function (entity) {
  var client = this.client
  var name = entity.name

  if (!name)
    throw new TypeError('Render error: missing entity name')

  var names = [ name ].concat(entity.aliases)

  names.forEach(function (name) {
    if (client.hasOwnProperty(name))
      throw new Error('Name conflict: "' + name + '" is already defined')

    Object.defineProperty(client, name, {
      enumerable: true,
      configurable: false,
      get: function () {
        return entity.render()
      },
      set: function () {
        throw new Error('Cannot override the property')
      }
    })
  })
}

// to do: isolate
function Client(client) {
  this._client = client
}

Client.prototype._doRequest = function (method, args) {
  // to do
}

;['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'TRACE', 'OPTIONS'].forEach(function (method) {
  Client.prototype[method] = function () {
    return this._doRequest(method, arguments)
  }
})

},{}],5:[function(require,module,exports){
var mw = require('midware')
var utils = require('./utils')
var agents = require('./agents')

module.exports = Context

function Context(ctx) {
  this.body = null
  this.parent = null

  this.body = null
  this.opts = {}
  this.query = {}
  this.params = {}
  this.headers = {}
  this.cookies = {}

  this.agentOpts = null
  this.agent = agents.defaults()

  this.mw = {
    request: mw(this),
    response: mw(this)
  }

  this.validators = {
    request: mw(this),
    response: mw(this)
  }

  if (ctx) this.useParent(ctx)
}

Context.prototype.useParent = function (ctx) {
  this.parent = ctx
  this.setupMiddleware(ctx)
}

Context.prototype.setupMiddleware = function (parent) {
  var self = this
  ;['mw', 'validators'].forEach(function (key) {
    ['request', 'response'].forEach(function (phase) {
      self[key][phase](function () {
        parent[key][phase].run.apply(self, arguments)
      })
    })
  })
}

Context.prototype.get = function () {
  var parent = {}
  var opts = this.opts

  if (this.parent) parent = this.parent.get()

  var basePath = parent.basePath || ''
  var data = utils.merge(parent, opts)
  data.basePath = basePath + (opts.basePath || '')

  data.headers = utils.merge(parent.headers, this.headers)
  data.query = utils.merge(parent.query, this.query)
  data.params = utils.merge(parent.params, this.params)
  data.cookies = utils.merge(parent.cookies, this.cookies)
  data.agentOpts = utils.merge(parent.agentOpts, this.agentOpts)

  data.ctx = this

  return data
}

Context.prototype.buildUrl = function (ctx) {
  var params = ctx.params
  var head = ctx.basePath || ''
  var tail = ctx.path || ''
  var path = utils.pathParams(head + tail, params)
  return ctx.rootUrl + path
}

},{"./agents":2,"./utils":16,"midware":22}],6:[function(require,module,exports){
var Response = require('./response')
var series = require('./utils').series

module.exports = Dispatcher

function Dispatcher(ctx) {
  this.ctx = ctx
}

Dispatcher.prototype.run = function (cb) {
  cb = cb || noop

  var req = this.ctx.get()
  var res = new Response(req)

  var phases = [
    function before(next) {
      this.before(req, res, next)
    },
    function dial(req, res, next) {
      this.dial(req, res, next)
    },
    function after(req, res, next) {
      this.after(req, res, next)
    }
  ]

  function done(err, req, res) {
    if (err === 'intercept') err = null
    cb(err, res)
  }

  series(phases, done, this)
}

Dispatcher.prototype.runPhase = function (phase, req, res, next) {
  var ctx = req.ctx

  ctx.mw[phase].run(req, res, function (err, _res) {
    if (err) return next(err, req, _res || res)

    ctx.validators[phase].run(req, res, function (err, _res) {
      next(err, req, _res || res)
    })
  })
}

Dispatcher.prototype.before = function (req, res, next) {
  this.runPhase('request', req, res, next)
}

Dispatcher.prototype.after = function (req, res, next) {
  this.runPhase('response', req, res, next)
}

Dispatcher.prototype.dial = function (req, res, next) {
  // Build full URL
  req.url = req.ctx.buildUrl(req)

  req.ctx.agent(req, res, function (err, res) {
    next(err, req, res)
  })
}

function noop() {}

},{"./response":13,"./utils":16}],7:[function(require,module,exports){
var Request = require('../request')
var Builder = require('../builder')
var Context = require('../context')

module.exports = Base

function Base() {
  this.name = null
  this.parent = null

  this.aliases = []
  this.methods = []
  this.resources = []
  this.collections = []

  this.ctx = new Context
}

Base.prototype = Object.create(Request.prototype)

/**
 * Attach entities
 */

Base.prototype.alias = function (name) {
  this.aliases.push(name)
  return this
}

Base.prototype.collection = function (collection) {
  if (!(collection instanceof Base.Collection)) {
    collection = new Base.Collection(collection)
  }

  collection.useParent(this)
  this.collections.push(collection)

  return collection
}

Base.prototype.resource = function (resource) {
  if (!(resource instanceof Base.Resource)) {
    resource = new Base.Resource(resource)
  }

  resource.useParent(this)
  this.resources.push(resource)

  return resource
}

Base.prototype.resource = function (resource) {
  if (!(resource instanceof Base.Resource)) {
    resource = new Base.Resource(resource)
  }

  resource.useParent(this)
  this.resources.push(resource)

  return resource
}

Base.prototype.render = function (client) {
  return new Builder(client || this).render()
}

},{"../builder":4,"../context":5,"../request":12}],8:[function(require,module,exports){
var Base = require('./base')

module.exports = Client

function Client(url) {
  Base.call(this)
  if (url) this.url(url)
}

Client.prototype = Object.create(Base.prototype)

Client.prototype.entity = 'client'

},{"./base":7}],9:[function(require,module,exports){
var Base = require('./base')

module.exports = Base.Collection = Collection

function Collection(name) {
  Base.call(this)
  this.name = name
}

Collection.prototype = Object.create(Base.prototype)

Collection.prototype.entity = 'collection'

},{"./base":7}],10:[function(require,module,exports){
module.exports = {
  Base: require('./base'),
  Client: require('./client'),
  Resource: require('./resource'),
  Collection: require('./collection')
}

},{"./base":7,"./client":8,"./collection":9,"./resource":11}],11:[function(require,module,exports){
var Base = require('./base')
var Request = require('../request')

module.exports = Base.Resource = Resource

function Resource(name) {
  Base.call(this)
  this.name = name
}

Resource.prototype = Object.create(Base.prototype)

Resource.prototype.entity = 'resource'

Resource.prototype.render = function () {
  var ctx = this.ctx
  var req = new Request(ctx)

  return function (opts, cb) {
    if (typeof opts === 'object')
      req.options(opts)

    if (typeof opts === 'function')
      cb = opts

    if (typeof cb === 'function')
      return req.end(cb)

    return req
  }
}

},{"../request":12,"./base":7}],12:[function(require,module,exports){
var types = require('./types')
var Context = require('./context')
var Dispatcher = require('./dispatcher')
var merge = require('./utils').merge

module.exports = Request

function Request(ctx) {
  this.parent = null
  this.ctx = new Context(ctx)
}

Request.prototype.url = function (url) {
  this.ctx.opts.rootUrl = url
  return this
}

Request.prototype.basePath = function (path) {
  this.ctx.opts.basePath = path
  return this
}

Request.prototype.path = function (path) {
  this.ctx.opts.path = path
  return this
}

Request.prototype.method = function (name) {
  this.ctx.opts.method = name
  return this
}

Request.prototype.param = function (name, value) {
  this.ctx.params[name] = value
  return this
}

Request.prototype.params = function (params) {
  merge(this.ctx.params, params)
  return this
}

Request.prototype.unsetParam = function (name) {
  delete this.ctx.params[name]
  return this
}

Request.prototype.query = function (query) {
  merge(this.ctx.query, query)
  return this
}

Request.prototype.queryParam = function (name, value) {
  this.ctx.query[name] = value
  return this
}

Request.prototype.unsetQuery = function (name) {
  delete this.ctx.query[name]
  return this
}

Request.prototype.set = function (name, value) {
  this.ctx.headers[name] = value
  return this
}

Request.prototype.unset = function (name) {
  delete this.ctx.headers[name]
  return this
}

Request.prototype.headers = function (headers) {
  merge(this.ctx.headers, headers)
}

Request.prototype.type = function (value) {
  this.ctx.headers['content-type'] = types[value] || value
  return this
}

Request.prototype.send =
Request.prototype.body = function (body) {
  this.ctx.body = body
  return this
}

Request.prototype.cookie = function (name, value) {
  this.ctx.cookies[name] = value
  return this
}

Request.prototype.unsetCookie = function (name) {
  delete this.ctx.cookies[name]
  return this
}

/**
 * Attach a new middleware in the incoming phase
 * @param {Function} middleware
 * @return {this}
 */

Request.prototype.use = function (middleware) {
  this.ctx.mw.request(middleware)
  return this
}

Request.prototype.useResponse = function (middleware) {
  this.ctx.mw.response(middleware)
  return this
}

Request.prototype.validate =
Request.prototype.validateRequest = function (middleware) {
  this.ctx.validators.request(middleware)
  return this
}

Request.prototype.validateResponse = function (middleware) {
  this.ctx.validators.response(middleware)
  return this
}

Request.prototype.end = function (cb) {
  return new Dispatcher(this.ctx).run(cb)
}

Request.prototype.agent = function (agent, opts) {
  if (typeof agent !== 'function')
    throw new TypeError('agent argument must be a function')

  this.ctx.agent = agent
  if (opts) this.ctx.agentOpts = opts

  return this
}

Request.prototype.agentOpts = function (opts) {
  this.ctx.agentOpts = opts
  return this
}

Request.prototype.options = function (opts) {
  merge(this.ctx.opts, opts)
  return this
}

Request.prototype.useParent = function (parent) {
  if (!(parent instanceof Request))
    throw new TypeError('Parent context is not a valid argument')

  this.parent = parent
  this.ctx.useParent(parent.ctx)

  return this
}

},{"./context":5,"./dispatcher":6,"./types":15,"./utils":16}],13:[function(require,module,exports){
module.exports = Response

function Response(req) {
  this.req = req

  this.orig =
  this.body =
  this.json =
  this.type = null

  this.headers = {}
  this.typeParams = {}

  this.status =
  this.statusType =
  this.statusCode = 0
  this.statusText = ''
}

Response.prototype.setOriginalResponse = function (orig) {
  this.orig = orig
}

Response.prototype.setBody = function (body) {
  this.body = body
  if (this.type === 'json') this.json = body
}

Response.prototype.get = function (name) {
  return this.headers[name.toLowerCase()]
}

Response.prototype.setHeaders = function (headers) {
  for (var key in headers) {
    this.headers[key.toLowerCase()] = headers[key]
  }

  var ct = this.headers['content-type']
  if (ct) this.setType(ct)
}

Response.prototype.setType = function (contentType) {
  // content-type
  var ct = contentType || ''
  this.type = type(ct)

  // params
  var obj = params(ct)
  for (var key in obj) this.typeParams[key] = obj[key]
}

Response.prototype.setStatus = function (status) {
  if (status === 1223) status = 204

  var type = status / 100 | 0

  // status / class
  this.statusType = type
  this.status = this.statusCode = status

  // basics
  this.info = 1 == type
  this.ok = 2 == type
  this.clientError = 4 == type
  this.serverError = 5 == type

  this.error = (4 == type || 5 == type)
    ? this.toError()
    : false

  // sugar
  this.accepted = 202 == status
  this.noContent = 204 == status
  this.badRequest = 400 == status
  this.unauthorized = 401 == status
  this.notAcceptable = 406 == status
  this.notFound = 404 == status
  this.forbidden = 403 == status
}

Response.prototype.setStatusText = function (text) {
  this.statusText = text
}

Response.prototype.toError = function () {
  var req = this.req
  var method = req.method
  var url = req.url

  var msg = 'cannot ' + method + ' ' + url + ' (' + this.status + ')'
  var err = new Error(msg)
  err.status = this.status
  err.method = method
  err.url = url

  return err
}

function params(str) {
  return str.split(/ *; */).reduce(function (obj, str) {
    var parts = str.split(/ *= */)
    var key = parts.shift()
    var val = parts.shift()
    if (key && val) obj[key] = val
    return obj
  }, {})
}

function type(str) {
  return str.split(/ *; */).shift()
}

},{}],14:[function(require,module,exports){
module.exports = theon

/**
 * API factory
 */

function theon(url) {
  return new theon.entities.Client(url)
}

/**
 * Export modules
 */

theon.Request    = require('./request')
theon.Context    = require('./context')
theon.Builder    = require('./builder')
theon.entities   = require('./entities')
theon.Dispatcher = require('./dispatcher')

/**
 * Current version
 */

theon.VERSION = '0.1.0'

},{"./builder":4,"./context":5,"./dispatcher":6,"./entities":10,"./request":12}],15:[function(require,module,exports){
module.exports = {
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  'form': 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
}

},{}],16:[function(require,module,exports){
module.exports = {
  merge: require('./merge'),
  series: require('./series'),
  pathParams: require('./path-params')
}

},{"./merge":17,"./path-params":18,"./series":19}],17:[function(require,module,exports){
module.exports = function merge(x, y) {
  x = x || {}
  for (var k in y) {
    x[k] = y[k]
  }
  return x
}

},{}],18:[function(require,module,exports){
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
  // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
  '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^()])+)\\))?|\\(((?:\\\\.|[^()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g')

module.exports = function (path, params) {
  var buf = null

  while ((buf = PATH_REGEXP.exec(path)) != null) {
    var param = buf[3]
    if (param && !params[param]) {
      throw new Error('Missing path param: ' + param)
    }
    path = path.replace(':' + param, params[param])
  }

  return path
}

},{}],19:[function(require,module,exports){
var slicer = Array.prototype.slice

module.exports = function series(arr, cb, ctx) {
  var stack = arr.slice()
  cb = cb || function () {}

  function next(err) {
    if (err) return cb.apply(ctx, arguments)

    var fn = stack.shift()
    if (!fn) return cb.apply(ctx, arguments)

    var args = slicer.call(arguments, 1)
    fn.apply(ctx, args.concat(next))
  }

  next()
}

},{}],20:[function(require,module,exports){

},{}],21:[function(require,module,exports){
/*! lil-http - v0.1.16 - MIT License - https://github.com/lil-js/http */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory)
  } else if (typeof exports === 'object') {
    factory(exports)
    if (typeof module === 'object' && module !== null) {
      module.exports = exports = exports.http
    }
  } else {
    factory((root.lil = root.lil || {}))
  }
}(this, function (exports) {
  'use strict'

  var VERSION = '0.1.16'
  var toStr = Object.prototype.toString
  var slicer = Array.prototype.slice
  var hasOwn = Object.prototype.hasOwnProperty
  var hasBind = typeof Function.prototype.bind === 'function'
  var origin = location.origin
  var originRegex = /^(http[s]?:\/\/[a-z0-9\-\.\:]+)[\/]?/i
  var jsonMimeRegex = /application\/json/
  var hasDomainRequest = typeof XDomainRequest !== 'undefined'
  var noop = function () {}

  var defaults = {
    method: 'GET',
    timeout: 30 * 1000,
    auth: null,
    data: null,
    headers: null,
    withCredentials: false,
    responseType: 'text'
  }

  function isObj(o) {
    return o && toStr.call(o) === '[object Object]' || false
  }

  function assign(target) {
    var i, l, x, cur, args = slicer.call(arguments).slice(1)
    for (i = 0, l = args.length; i < l; i += 1) {
      cur = args[i]
      for (x in cur) if (hasOwn.call(cur, x)) target[x] = cur[x]
    }
    return target
  }

  function once(fn) {
    var called = false
    return function () {
      if (called === false) {
        called = true
        fn.apply(null, arguments)
      }
    }
  }

  function setHeaders(xhr, headers) {
    if (isObj(headers)) {
      headers['Content-Type'] = headers['Content-Type'] || http.defaultContent
      for (var field in headers) if (hasOwn.call(headers, field)) {
        xhr.setRequestHeader(field, headers[field])
      }
    }
  }

  function getHeaders(xhr) {
    var headers = {}, rawHeaders = xhr.getAllResponseHeaders().trim().split('\n')
    rawHeaders.forEach(function (header) {
      var split = header.trim().split(':')
      var key = split.shift().trim()
      var value = split.join(':').trim()
      headers[key] = value
    })
    return headers
  }

  function isJSONResponse(xhr) {
    return jsonMimeRegex.test(xhr.getResponseHeader('Content-Type'))
  }

  function encodeParams(params) {
    return Object.getOwnPropertyNames(params).filter(function (name) {
      return params[name] !== undefined
    }).map(function (name) {
      var value = (params[name] === null) ? '' : params[name]
      return encodeURIComponent(name) + (value ? '=' + encodeURIComponent(value) : '')
    }).join('&').replace(/%20/g, '+')
  }

  function parseData(xhr) {
    var data = null
    if (xhr.responseType === 'text') {
      data = xhr.responseText
      if (isJSONResponse(xhr) && data) data = JSON.parse(data)
    } else {
      data = xhr.response
    }
    return data
  }

  function getStatus(status) {
    return status === 1223 ? 204 : status // IE9 fix
  }

  function buildResponse(xhr) {
    var response = {
      xhr: xhr,
      status: getStatus(xhr.status),
      statusText: xhr.statusText,
      data: null,
      headers: {}
    }
    if (xhr.readyState === 4) {
      response.data = parseData(xhr)
      response.headers = getHeaders(xhr)
    }
    return response
  }

  function buildErrorResponse(xhr, error) {
    var response = buildResponse(xhr)
    response.error = error
    if (error.stack) response.stack = error.stack
    return response
  }

  function cleanReferences(xhr) {
    xhr.onreadystatechange = xhr.onerror = xhr.ontimeout = null
  }

  function isValidResponseStatus(xhr) {
    var status = getStatus(xhr.status)
    return status >= 200 && status < 300 || status === 304
  }

  function onError(xhr, cb) {
    return once(function (err) {
      cb(buildErrorResponse(xhr, err), null)
    })
  }

  function onLoad(config, xhr, cb) {
    return function (ev) {
      if (xhr.readyState === 4) {
        cleanReferences(xhr)
        if (isValidResponseStatus(xhr)) {
          cb(null, buildResponse(xhr))
        } else {
          onError(xhr, cb)(ev)
        }
      }
    }
  }

  function isCrossOrigin(url) {
    var match = url.match(originRegex)
    return match && match[1] === origin
  }

  function getURL(config) {
    var url = config.url
    if (isObj(config.params)) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + encodeParams(config.params)
    }
    return url
  }

  function XHRFactory(url) {
    if (hasDomainRequest && isCrossOrigin(url)) {
      return new XDomainRequest()
    } else {
      return new XMLHttpRequest()
    }
  }

  function createClient(config) {
    var method = (config.method || 'GET').toUpperCase()
    var auth = config.auth
    var url = getURL(config)

    var xhr = XHRFactory(url)
    if (auth) {
      xhr.open(method, url, true, auth.user, auth.password)
    } else {
      xhr.open(method, url)
    }
    xhr.withCredentials = config.withCredentials
    xhr.responseType = config.responseType
    xhr.timeout = config.timeout
    setHeaders(xhr, config.headers)
    return xhr
  }

  function updateProgress(xhr, cb) {
    return function (ev) {
      if (ev.lengthComputable) {
        cb(ev, ev.loaded / ev.total)
      } else {
        cb(ev)
      }
    }
  }

  function hasContentTypeHeader(config) {
    return config && isObj(config.headers)
      && (config.headers['content-type'] || config.headers['Content-Type'])
      || false
  }

  function buildPayload(xhr, config) {
    var data = config.data
    if (isObj(config.data) || Array.isArray(config.data)) {
      if (hasContentTypeHeader(config) === false) {
        xhr.setRequestHeader('Content-Type', 'application/json')
      }
      data = JSON.stringify(config.data)
    }
    return data
  }

  function timeoutResolver(cb, timeoutId) {
    return function () {
      clearTimeout(timeoutId)
      cb.apply(null, arguments)
    }
  }

  function request(config, cb, progress) {
    var xhr = createClient(config)
    var data = buildPayload(xhr, config)
    var errorHandler = onError(xhr, cb)

    if (hasBind) {
      xhr.ontimeout = errorHandler
    } else {
      var timeoutId = setTimeout(function abort() {
        if (xhr.readyState !== 4) {
          xhr.abort()
        }
      }, config.timeout)
      cb = timeoutResolver(cb, timeoutId)
      errorHandler = onError(xhr, cb)
    }

    xhr.onreadystatechange = onLoad(config, xhr, cb)
    xhr.onerror = errorHandler
    if (typeof progress === 'function') {
      xhr.onprogress = updateProgress(xhr, progress)
    }

    try {
      xhr.send(data || null)
    } catch (e) {
      errorHandler(e)
    }

    return { xhr: xhr, config: config }
  }

  function requestFactory(method) {
    return function (url, options, cb, progress) {
      var i, l, cur = null
      var config = assign({}, defaults, { method: method })
      var args = slicer.call(arguments)

      for (i = 0, l = args.length; i < l; i += 1) {
        cur = args[i]
        if (typeof cur === 'function') {
          if (args.length === (i + 1) && typeof args[i - 1] === 'function') {
            progress = cur
          } else {
            cb = cur
          }
        } else if (isObj(cur)) {
          assign(config, cur)
        } else if (typeof cur === 'string' && !config.url) {
          config.url = cur
        }
      }

      return request(config, cb || noop, progress)
    }
  }

  function http(config, data, cb, progress) {
    return requestFactory('GET').apply(null, arguments)
  }

  http.VERSION = VERSION
  http.defaults = defaults
  http.defaultContent = 'text/plain'
  http.get = requestFactory('GET')
  http.post = requestFactory('POST')
  http.put = requestFactory('PUT')
  http.patch = requestFactory('PATCH')
  http.head = requestFactory('HEAD')
  http.delete = http.del = requestFactory('DELETE')

  return exports.http = http
}))

},{}],22:[function(require,module,exports){
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory)
  } else if (typeof exports === 'object') {
    factory(exports)
    if (typeof module === 'object' && module !== null) {
      module.exports = exports = exports.midware
    }
  } else {
    factory(root)
  }
}(this, function (exports) {
  'use strict'

  function midware(ctx) {
    var calls = use.stack = []
    ctx = ctx || null
       
    function use() {
      toArray(arguments)
      .filter(function (fn) {
        return typeof fn === 'function'
      })
      .forEach(function (fn) {
        calls.push(fn)
      })
      return ctx
    }

    use.run = function run() {
      var done, args = toArray(arguments)
      
      if (typeof args[args.length - 1] === 'function') {
        done = args.pop()
      }
      
      if (!calls.length) {
        if (done) done.call(ctx)
        return
      }
      
      var stack = calls.slice()
      args.push(next)
      
      function runNext() {
        var fn = stack.shift()
        fn.apply(ctx, args)
      }

      function next(err, end) {
        if (err || end || !stack.length) {
          stack = null
          if (done) done.call(ctx, err, end)
        } else {
          runNext()
        }
      }

      runNext()
    }

    use.remove = function (name) {
      for (var i = 0, l = calls.length; i < l; i += 1) {
        var fn = calls[i]
        if (fn === name || fn.name === name) {
          calls.splice(i, 1)
          break
        }
      }
    }

    use.flush = function () {
      calls.splice(0)
    }

    return use
  }

  function toArray(nargs) {
    var args = new Array(nargs.length)
    for (var i = 0, l = args.length; i < l; i += 1) {
      args[i] = nargs[i]
    }
    return args
  }
  
  midware.VERSION = '0.1.7'
  exports.midware = midware
}))

},{}]},{},[14])(14)
});