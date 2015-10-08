var Base = require('./base')

module.exports = Base.Mixin = Mixin

function Mixin(name, fn) {
  if (typeof fn !== 'function')
    throw new TypeError('mixin must be a function')

  Base.call(this, name)
  this.fn = fn
}

Mixin.prototype = Object.create(Base.prototype)

Mixin.prototype.entity = 'mixin'

Mixin.prototype.render = function () {
  var fn = this.fn
  return function mixin() {
    return fn.apply(this, arguments)
  }
}