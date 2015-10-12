# theon [![Build Status](https://api.travis-ci.org/h2non/theon.svg?branch=master&style=flat)][travis] [![Code Climate](https://codeclimate.com/github/h2non/theon/badges/gpa.svg)](https://codeclimate.com/github/h2non/theon) [![NPM](https://img.shields.io/npm/v/theon.svg)](https://www.npmjs.org/package/theon)

`theon` is a lightweight JavaScript library which helps you to create in a declarative way domain-specific, extensible, elegant and fluent programmatic bindings to any HTTP layer, usually when builing API clients to remote HTTP services.

**Still beta**. Documentation, examples and better test coverage is a work in progress yet.

## Features

- Modular pluggable design
- Hierarchical middleware layer (inspired by [connect](https://github.com/senchalabs/connect))
- Fluent and expressive API
- Nested configurations
- Domain-specific API generator
- Request/response interceptors
- Request/response validators
- Bind bodies to custom models
- Path params parsing and matching
- Generates a fluent and semantic programmatic API
- HTTP client agnostic: use `request`, `superagent`, `jQuery` or any other via adapters
- Dependency free
- Designed for testability (via mock interceptor)
- Lightweight: 16KB (~5KB gzipped)
- Cross-environment: runs in browsers and node.js

<!--
## How `theon` could be help me?

- Unifies logic and configuration across
- Decouples HTTP interface details from programmatic API consumers
-->

## Contents

- [Rationale](#rationale)
- [Installation](#installation)
- [Environments](#environments)
- [Plugins](#plugins)
- [Usage](#usage)
- [API](#api)

## Rationale

I wrote this library to mitigate my frustration while writting further programmatic API clients to HTTP APIs in JavaScript environments.

After dealing with recurrent scenarios, I realized that the process is essentially boilerplate in most cases, and a specific solution can be conceived to simplify the process and provide recurrent features to satifify common needs.

In most scenarios when creating APIs you have to build an abstract programmatic layer which maps to specific HTTP resources, mostly when dealing with REST oriented HTTP services. 
With `theon` you can decouple those parts and provide a convenient abstraction between the HTTP interface details and programmatic API consumers.

Additionally, it provides a set of rich features to make you programmatic layer more powerful for either you as API builder and your API consumers, through a hierarchical middleware layer allowing you to plugin intermediate logic, custom validators.

## Installation

Via npm:
```bash
npm install theon --save
```

Via bower:
```bash
bower install theon --save
```

Or loading the script:
```html
<script src="//cdn.rawgit.com/h2non/theon/0.1.0/theon.js"></script>
```

## Environments

Runs in any [ES5 compliant](http://kangax.github.io/mcompat-table/es5/) engine

![Node.js](https://cdn0.iconfinder.com/data/icons/long-shadow-web-icons/512/nodejs-48.png) | ![Chrome](https://raw.github.com/alrra/browser-logos/master/chrome/chrome_48x48.png) | ![Firefox](https://raw.github.com/alrra/browser-logos/master/firefox/firefox_48x48.png) | ![IE](https://raw.github.com/alrra/browser-logos/master/internet-explorer/internet-explorer_48x48.png) | ![Opera](https://raw.github.com/alrra/browser-logos/master/opera/opera_48x48.png) | ![Safari](https://raw.github.com/alrra/browser-logos/master/safari/safari_48x48.png)
---  | --- | --- | --- | --- | --- |
+0.10 | +5 | +3.5 | +9 | +10 | +5 |

## HTTP adapters

#### Node.js

- [request](https://github.com/request/request) `default` - Popular and featured HTTP client

#### Browsers

- [lil-http](https://github.com/lil-js/http) `default` - Lightweight XHR wrapper for browsers

## Plugins

`to do`

## Usage

In order to provide a straightforward programmatic API like this:
```js
myapi.users
  .find()
  .query({ limit: 50 })
  .end(function (err, res) { ... })

myapi.auth
  .signup()
  .send({ username: 'foo', password: 'b@r' })
  .end(function (err, res) { ... })

myapi.wallet
  .create()
  .send({ username: 'foo', password: 'b@r' })
  .end(function (err, res) { ... })
```

Then using `theon` you can write:
```js
var theon = require('theon')

// First, we must build a new client
var clientBuilder = theon('http://my.api.com')
  .basePath('/api')
  .set('Version', '1.0')
  .use(function (req, res, next) {
    // Global HTTP middleware
    next()
  })

// Attach a new collection
var collection = clientBuilder
  .collection('users')
  .basePath('/users')
  .use(function (req, res, next) {
    // Collection specific HTTP middleware
    next()
  })

// Attach a new resource to that collection
collection
  .resource('get')
  .alias('find')
  .path('/:id')
  .method('GET')
  .use(function (req, res, next) {
    // Resource specific middleware
    next()
  })

// Render the API client: this will be the public
// interface you must expose for your API consumers
var apiClient = client.render()

// Use the API as consumer
apiClient
  .users
  .get()
  .param('id', 123)
  .type('json')
  .use(function (req, res, next) {
    // Request phase specific middleware
    next()
  })
  .param('id', 123)
  .end(function (err, res) {
    console.log('Response:', res.statusCode)
    console.log('Body:', res.body)
  })
```

## API

### theon([ url ])

#### Request

#### Response

## License

[MIT](http://opensource.org/licenses/MIT) © Tomas Aparicio

[travis]: http://travis-ci.org/h2non/theon
