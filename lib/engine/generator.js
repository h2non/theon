var Client = require('./client')
var has = require('../utils').has

module.exports = Generator

/**
 * Generator is responsible of the API rendering of a given Entity instance
 * based on recursive child entities instrospection.
 *
 * @param {Entity} entity - Client entity to generate.
 * @constructor
 * @class Generator
 */

function Generator (entity) {
  this.src = entity
  this.target = null
}

/**
 * Binds the target object who will inherit the dynamically generated API.
 *
 * @param {Client|Object} target
 * @return {this}
 * @method bind
 */

Generator.prototype.bind = function (target) {
  this.target = target
  return this
}

/**
 * Perform the API generation/rendering process.
 *
 * @return {Object}
 * @method render
 */

Generator.prototype.render = function () {
  var src = this.src

  this.target = this.target
    ? this.target
    : new Client(src)

  // Expose the original client, if empty
  if (!this.target._client) this.target._client = src

  // Render nested entities
  this.src.entities.forEach(this.renderEntity, this)

  // Render prototype chain, if present
  if (src.proto) this.renderProto()

  return this.target
}

/**
 * Renders the given entity and its childs entities.
 *
 * @param {Entity} entity
 * @method renderEntity
 * @protected
 */

Generator.prototype.renderEntity = function (entity) {
  var name = entity.name
  if (!name) throw new TypeError('Render error: missing entity name')

  // Render entity and it's childs
  var value = entity.renderEntity()

  // Use entity constructor decorators
  var delegate = this.decorate(entity, value)

  // Define name entity accessors
  var names = [ name ].concat(entity.aliases)
  names.forEach(function (name) { this.define(name, delegate) }, this)
}

/**
 * Decorates a given entity with a custom delegator function.
 *
 * @param {Entity} entity
 * @param {Function} delegate
 * @return {Function}
 * @method decorate
 * @protected
 */

Generator.prototype.decorate = function (entity, delegate) {
  // Use entity constructor decorators
  var reduced = reduceDecorators(entity, delegate)

  // If no decorators, delegate to original
  if (reduced === delegate) return delegate

  // If not a function, pass as delegator as it is
  if (typeof reduced !== 'function') return reduced

  // Create final decorator function
  var decorator = decorate(reduced)

  // Clone own properties to keep interface consistency
  Object.keys(delegate)
  .filter(function (key) {
    return has(decorator, key) === false
  })
  .forEach(function (key) {
    decorator[key] = delegate[key]
  })

  return decorator
}

function reduceDecorators (entity, delegate) {
  return entity.decorators.reduce(function (curr, decorator) {
    return decorator.call(entity, curr) || curr
  }, delegate)
}

function decorate (delegate) {
  return function entityDecorator () {
    return delegate.apply(delegate, arguments)
  }
}

/**
 * Renders and binds the custom prototype chain.
 *
 * @method renderProto
 * @protected
 */

Generator.prototype.renderProto = function () {
  Object.keys(this.src.proto).forEach(function (name) {
    this.define(name, this.src.proto[name])
  }, this)
}

/**
 * Defines an own property accessor binding to API in the target object.
 *
 * @param {String} name
 * @param {Mixed} value
 * @method define
 * @protected
 */

Generator.prototype.define = function (name, value) {
  if (has(this.target, name)) throw nameConflict(name)

  Object.defineProperty(this.target, name, {
    enumerable: true,
    configurable: false,
    get: function () { return value },
    set: function () { throw new Error('Cannot overwrite property: ' + name) }
  })
}

function nameConflict (name) {
  return new Error('Name conflict: "' + name + '" property is already defined')
}
