var utils = require('./utils')
var agents = require('./agents')
var Context = require('./context')
var Response = require('./http/response')
var Dispatcher = require('./dispatcher')
var middleware = require('./middleware')

module.exports = Base

/**
 * Base implements a generic interface that is inherited by all
 * the HTTP entities, from configuration to runtime HTTP objects.
 *
 * It provides a convenient methods to attach middleware and observer hooks.
 *
 * @param {Context} ctx - Optional parent context.
 * @constructor
 * @class Base
 */

function Base (ctx) {
  this.plugins = []
  this.ctx = new Context(ctx)
}

Base.prototype.use =
Base.prototype.useRequest = function (middleware) {
  this.ctx.middleware.use('middleware request', middleware)
  return this
}

Base.prototype.useEntity =
Base.prototype.useEntityRequest = function (middleware) {
  var phase = 'middleware request ' + this.entityHierarchy
  this.ctx.middleware.use(phase, middleware)
  return this
}

Base.prototype.useResponse = function (middleware) {
  this.ctx.middleware.use('middleware response', middleware)
  return this
}

Base.prototype.useEntityResponse = function (middleware) {
  var phase = 'middleware response ' + this.entityHierarchy
  this.ctx.middleware.use(phase, middleware)
  return this
}

Base.prototype.before = function (middleware) {
  this.ctx.middleware.use('before', middleware)
  return this
}

Base.prototype.after = function (middleware) {
  this.ctx.middleware.use('after', middleware)
  return this
}

Base.prototype.validator =
Base.prototype.requestValidator = function (middleware) {
  this.ctx.middleware.use('validator request', middleware)
  return this
}

Base.prototype.entityValidator =
Base.prototype.entityRequestValidator = function (middleware) {
  var phase = 'validator request ' + this.entityHierarchy
  this.ctx.middleware.use(phase, middleware)
  return this
}

Base.prototype.responseValidator = function (middleware) {
  this.ctx.middleware.use('validator response', middleware)
  return this
}

Base.prototype.entityResponseValidator = function (middleware) {
  var phase = 'validator response ' + this.entityHierarchy
  this.ctx.middleware.use(phase, middleware)
  return this
}

Base.prototype.interceptor = function (interceptor) {
  this.ctx.middleware.use('before dial', interceptor)
  return this
}

Base.prototype.entityInterceptor = function (interceptor) {
  this.ctx.middleware.use('before dial ' + this.entityHierarchy, interceptor)
  return this
}

Base.prototype.evaluator = function (evaluator) {
  this.ctx.middleware.use('before response', evaluator)
  return this
}

Base.prototype.entityEvaluator = function (evaluator) {
  this.ctx.middleware.use('before response' + this.entityHierarchy, evaluator)
  return this
}

Base.prototype.validate = function (cb) {
  var req = this.raw()
  var res = new Response(this.req)
  var dis = new Dispatcher(this)
  dis.runStack('validator', 'request', req, res, cb)
  return this
}

Base.prototype.observe = function (phase, hook) {
  this.ctx.middleware.use(phase, hook)
  return this
}

Base.prototype.observeEntity = function (phase, hook) {
  this.ctx.middleware.use(phase + ' ' + this.entityHierarchy, hook)
  return this
}

Base.prototype.plugin =
Base.prototype.usePlugin = function (plugin) {
  if (typeof plugin !== 'function') {
    throw new TypeError('plugin must be a function')
  }

  var instance = plugin(this)
  this.plugins.push({ fn: plugin, instance: instance })

  return this
}

Base.prototype.getPlugin = function (search) {
  return this.plugins.reduce(function (match, plugin) {
    if (match) return match
    if (matches(plugin, search)) return plugin.instance || plugin
    return null
  }, null)

  function matches (plugin, search) {
    return search === plugin.fn ||
      search === plugin.instance ||
      search === plugin.fn.$name ||
      search === plugin.fn.name
  }
}

Base.prototype.model = function (model) {
  this.useResponse(middleware.model(model))
  return this
}

Base.prototype.map =
Base.prototype.bodyMap = function (mapper) {
  this.ctx.middleware.use('after response', middleware.map(mapper))
  return this
}

Base.prototype.agent = function (agent) {
  if (typeof agent === 'string') {
    agent = agents.get(agent)
  }
  if (typeof agent !== 'function') {
    throw new TypeError('unsupported or invalid agent')
  }
  this.ctx.agent = agent
  return this
}

Base.prototype.agentOpts = function (opts) {
  utils.extend(this.ctx.agentOpts, opts)
  return this
}

Base.prototype.setAgentOpts = function (opts) {
  this.ctx.agentOpts = opts
  return this
}

Base.prototype.persistAgentOpts = function (opts) {
  this.ctx.persistent.agentOpts = opts
  return this
}
