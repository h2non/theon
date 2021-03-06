var pathParams = require('path-params')
var utils = require('./utils')
var Response = require('./http/response')

module.exports = Dispatcher

/**
 * Dispatcher implements an HTTP traffic dispatcher encapsulating
 * the middleware control flow, state and error handling when
 * communicating with the HTTP agent via agent adapter.
 *
 * @param {Request} req - Outgoing request.
 * @constructor
 * @class Dispatcher
 */

function Dispatcher (req) {
  this.req = req
}

/**
 * Trigger the dispatcher process for the current request.
 *
 * @param {Function} cb
 * @return {Request}
 * @method run
 */

Dispatcher.prototype.run = function (cb) {
  cb = cb || noop

  var ctx = this.req.ctx
  var req = this.req.raw()
  var res = new Response(req)

  function done (err, _req, res) {
    _req = _req || req

    // Cache client instance
    var client = this.req

    // If request was intercepted, ignore the error
    if (err === 'intercept') err = null

    // Set request context, if not present
    if (res && !res.req) res.req = _req

    // Resolve the callback
    if (!err) return cb(null, res, client)

    // Expose the error in the request
    _req.error = err

    // Dispatch the error hook
    ctx.middleware.run('error', _req, res, function (_err, _res) {
      cb(_err || err, _res || res, client)
    })
  }

  utils.series([
    function before (next) {
      this.before(req, res, next)
    },
    function dial (req, res, next) {
      this.dial(req, res, next)
    },
    function after (req, res, next) {
      this.after(req, res, next)
    }
  ], done, this)

  return this.req
}

/**
 * Trigger the before phase.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method before
 */

Dispatcher.prototype.before = function (req, res, next) {
  utils.series([
    function before (next) {
      this.runHook('before', req, res, next)
    },
    function request (req, res, next) {
      this.runPhase('request', req, res, next)
    }
  ], next, this)
}

/**
 * Trigger the after phase.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method after
 */

Dispatcher.prototype.after = function (req, res, next) {
  utils.series([
    function response (next) {
      this.runPhase('response', req, res, next)
    },
    function after (req, res, next) {
      this.runHook('after', req, res, next)
    }
  ], next, this)
}

/**
 * Trigger the network dialing phase.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method dial
 */

Dispatcher.prototype.dial = function (req, res, next) {
  var url = req.opts.rootUrl || ''
  var path = req.ctx.buildPath()
  var params = req.ctx.renderParams(req)
  var fullPath = pathParams(path, params)

  // If returned an error, fail with it
  if (fullPath instanceof Error) return next(fullPath)

  // Compose the full URL
  req.url = url + fullPath

  utils.series([
    function before (next) {
      this.runMiddleware('before dial', req, res, next)
    },
    function (req, res, next) {
      this.doDial(req, res, next)
    },
    function after (req, res, next) {
      this.runMiddleware('after dial', req, res, next)
    }
  ], next, this)
}

/**
 * Performs HTTP network dialing.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method doDial
 */

Dispatcher.prototype.doDial = function (req, res, next) {
  var nextFn = utils.once(forward(req, res, next))

  // Call the HTTP agent adapter
  res.orig = req.ctx.agent(req, res, nextFn)

  // Handle writable stream pipes
  if (res.orig && res.orig.pipe) {
    (req.pipes || this.req.pipes || []).forEach(res.orig.pipe, res.orig)
  }

  // Dispatch the dialing observer
  this.runMiddleware('dialing', req, res, onDialing)

  function onDialing (err) {
    if (err && res.orig && typeof res.orig.abort === 'function') {
      nextFn(new Error('Request aborted: ' + (err.message || err)))
      try { res.orig.abort() } catch (e) {}
    }
  }
}

/**
 * Runs a custom hook by event name.
 *
 * @param {String} event
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method runHook
 */

Dispatcher.prototype.runHook = function (event, req, res, next) {
  utils.series([
    function global (next) {
      this.runMiddleware(event, req, res, next)
    },
    function entity (req, res, next) {
      this.runEntity(event, req, res, next)
    }
  ], next, this)
}

/**
 * Runs a custom hook phase by name.
 *
 * @param {String} phase
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method runPhase
 */

Dispatcher.prototype.runPhase = function (phase, req, res, next) {
  utils.series([
    function before (next) {
      this.runHook('before ' + phase, req, res, next)
    },
    function middleware (req, res, next) {
      this.runStack('middleware', phase, req, res, next)
    },
    function validate (req, res, next) {
      this.runStack('validator', phase, req, res, next)
    },
    function after (req, res, next) {
      this.runHook('after ' + phase, req, res, next)
    }
  ], next, this)
}

/**
 * Runs a custom middleware stack by name.
 *
 * @param {String} stack
 * @param {String} phase
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method runStack
 */

Dispatcher.prototype.runStack = function (stack, phase, req, res, next) {
  var event = stack + ' ' + phase

  utils.series([
    function before (next) {
      this.runHook('before ' + event, req, res, next)
    },
    function run (req, res, next) {
      this.runMiddleware(event, req, res, next)
    },
    function runEntity (req, res, next) {
      this.runEntity(event, req, res, next)
    },
    function after (req, res, next) {
      this.runHook('after ' + event, req, res, next)
    }
  ], next, this)
}

/**
 * Runs a middleware stack by entity name.
 *
 * @param {String} event
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method runEntity
 */

Dispatcher.prototype.runEntity = function (event, req, res, next) {
  if (!req.client) return next(null, req, res)

  var hierarchy = req.client.entityHierarchy
  if (!hierarchy) return next(null, req, res)

  var phase = event + ' ' + hierarchy
  this.runMiddleware(phase, req, res, next)
}

/**
 * Runs a context middleware stack by name.
 *
 * @param {String} event
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @method runMiddleware
 */

Dispatcher.prototype.runMiddleware = function (event, req, res, next) {
  req.ctx.middleware.run(event, req, res, forward(req, res, next))
}

function forward (req, res, next) {
  return function (err, _res) {
    next(err, req, _res || res)
  }
}

function noop () {}
