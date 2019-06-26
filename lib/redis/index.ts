import {defaults, noop} from '../utils/lodash';
import {inherits} from 'util';
import {EventEmitter} from 'events';
import Deque = require('denque');
import Command from '../command';
import Commander from '../commander';
import {isInt, CONNECTION_CLOSED_ERROR_MSG, parseURL, Debug} from '../utils';
import asCallback from 'standard-as-callback';
import * as eventHandler from './event_handler';
import {StandaloneConnector, SentinelConnector} from '../connectors';
import ScanStream from '../ScanStream';
import * as commands from 'redis-commands';
import * as PromiseContainer from '../promiseContainer';
import {addTransactionSupport} from '../transaction';
import {IRedisOptions, ReconnectOnError, DEFAULT_REDIS_OPTIONS} from './RedisOptions';

var debug = Debug('redis')

/**
 * Creates a Redis instance
 *
 * @constructor
 * @param {(number|string|Object)} [port=6379] - Port of the Redis server,
 * or a URL string(see the examples below),
 * or the `options` object(see the third argument).
 * @param {string|Object} [host=localhost] - Host of the Redis server,
 * when the first argument is a URL string,
 * this argument is an object represents the options.
 * @param {Object} [options] - Other options.
 * @param {number} [options.port=6379] - Port of the Redis server.
 * @param {string} [options.host=localhost] - Host of the Redis server.
 * @param {string} [options.family=4] - Version of IP stack. Defaults to 4.
 * @param {string} [options.path=null] - Local domain socket path. If set the `port`,
 * `host` and `family` will be ignored.
 * @param {number} [options.keepAlive=0] - TCP KeepAlive on the socket with a X ms delay before start.
 * Set to a non-number value to disable keepAlive.
 * @param {boolean} [options.noDelay=true] - Whether to disable the Nagle's Algorithm. By default we disable
 * it to reduce the latency.
 * @param {string} [options.connectionName=null] - Connection name.
 * @param {number} [options.db=0] - Database index to use.
 * @param {string} [options.password=null] - If set, client will send AUTH command
 * with the value of this option when connected.
 * @param {boolean} [options.dropBufferSupport=false] - Drop the buffer support for better performance.
 * This option is recommended to be enabled when
 * handling large array response and you don't need the buffer support.
 * @param {boolean} [options.enableReadyCheck=true] - When a connection is established to
 * the Redis server, the server might still be loading the database from disk.
 * While loading, the server not respond to any commands.
 * To work around this, when this option is `true`,
 * ioredis will check the status of the Redis server,
 * and when the Redis server is able to process commands,
 * a `ready` event will be emitted.
 * @param {boolean} [options.enableOfflineQueue=true] - By default,
 * if there is no active connection to the Redis server,
 * commands are added to a queue and are executed once the connection is "ready"
 * (when `enableReadyCheck` is `true`,
 * "ready" means the Redis server has loaded the database from disk, otherwise means the connection
 * to the Redis server has been established). If this option is false,
 * when execute the command when the connection isn't ready, an error will be returned.
 * @param {number} [options.connectTimeout=10000] - The milliseconds before a timeout occurs during the initial
 * connection to the Redis server.
 * @param {boolean} [options.autoResubscribe=true] - After reconnected, if the previous connection was in the
 * subscriber mode, client will auto re-subscribe these channels.
 * @param {boolean} [options.autoResendUnfulfilledCommands=true] - If true, client will resend unfulfilled
 * commands(e.g. block commands) in the previous connection when reconnected.
 * @param {boolean} [options.lazyConnect=false] - By default,
 * When a new `Redis` instance is created, it will connect to Redis server automatically.
 * If you want to keep the instance disconnected until a command is called, you can pass the `lazyConnect` option to
 * the constructor:
 *
 * ```javascript
 * var redis = new Redis({ lazyConnect: true });
 * // No attempting to connect to the Redis server here.

 * // Now let's connect to the Redis server
 * redis.get('foo', function () {
 * });
 * ```
 * @param {Object} [options.tls] - TLS connection support. See https://github.com/luin/ioredis#tls-options
 * @param {string} [options.keyPrefix=''] - The prefix to prepend to all keys in a command.
 * @param {function} [options.retryStrategy] - See "Quick Start" section
 * @param {number} [options.maxRetriesPerRequest] - See "Quick Start" section
 * @param {number} [options.maxLoadingRetryTime=10000] - when redis server is not ready, we will wait for
 * `loading_eta_seconds` from `info` command or maxLoadingRetryTime (milliseconds), whichever is smaller.
 * @param {function} [options.reconnectOnError] - See "Quick Start" section
 * @param {boolean} [options.readOnly=false] - Enable READONLY mode for the connection.
 * Only available for cluster mode.
 * @param {boolean} [options.stringNumbers=false] - Force numbers to be always returned as JavaScript
 * strings. This option is necessary when dealing with big numbers (exceed the [-2^53, +2^53] range).
 * @param {boolean} [options.enableTLSForSentinelMode=false] - Whether to support the `tls` option
 * when connecting to Redis via sentinel mode.
 * @param {NatMap} [options.natMap=null] NAT map for sentinel connector.
 * @param {boolean} [options.updateSentinels=true] - Update the given `sentinels` list with new IP
 * addresses when communicating with existing sentinels.
 * @extends [EventEmitter](http://nodejs.org/api/events.html#events_class_events_eventemitter)
 * @extends Commander
 * @example
 * ```js
 * var Redis = require('ioredis');
 *
 * var redis = new Redis();
 *
 * var redisOnPort6380 = new Redis(6380);
 * var anotherRedis = new Redis(6380, '192.168.100.1');
 * var unixSocketRedis = new Redis({ path: '/tmp/echo.sock' });
 * var unixSocketRedis2 = new Redis('/tmp/echo.sock');
 * var urlRedis = new Redis('redis://user:password@redis-service.com:6379/');
 * var urlRedis2 = new Redis('//localhost:6379');
 * var authedRedis = new Redis(6380, '192.168.100.1', { password: 'password' });
 * ```
 */
export default Redis;
function Redis(port: number, host: string, options: IRedisOptions): void
function Redis(path: string, options: IRedisOptions): void
function Redis(port: number, options: IRedisOptions): void
function Redis(port: number, host: string): void
function Redis(options: IRedisOptions): void
function Redis(port: number): void
function Redis(path: string): void
function Redis(): void
function Redis() {
  if (!(this instanceof Redis)) {
    console.error(new Error('Calling `Redis()` like a function is deprecated. Using `new Redis()` instead.').stack.replace('Error', 'Warning'));
    return new Redis(arguments[0], arguments[1], arguments[2]);
  }

  this.parseOptions(arguments[0], arguments[1], arguments[2]);

  EventEmitter.call(this);
  Commander.call(this);

  this.resetCommandQueue();
  this.resetOfflineQueue();

  if (this.options.Connector) {
    this.connector = new this.options.Connector(this.options);
  } else if (this.options.sentinels) {
    this.connector = new SentinelConnector(this.options);
  } else {
    this.connector = new StandaloneConnector(this.options);
  }

  this.retryAttempts = 0;

  // end(or wait) -> connecting -> connect -> ready -> end
  if (this.options.lazyConnect) {
    this.setStatus('wait');
  } else {
    this.connect().catch(noop);
  }
}

inherits(Redis, EventEmitter);
Object.assign(Redis.prototype, Commander.prototype);

/**
 * Create a Redis instance
 *
 * @deprecated
 */
Redis.createClient = function (...args): Redis {
  // @ts-ignore
  return new Redis(...args);
};

/**
 * Default options
 *
 * @var defaultOptions
 * @private
 */
Redis.defaultOptions = DEFAULT_REDIS_OPTIONS;

Redis.prototype.resetCommandQueue = function () {
  this.commandQueue = new Deque();
};

Redis.prototype.resetOfflineQueue = function () {
  this.offlineQueue = new Deque();
};

Redis.prototype.parseOptions = function () {
  this.options = {};
  for (var i = 0; i < arguments.length; ++i) {
    var arg = arguments[i];
    if (arg === null || typeof arg === 'undefined') {
      continue;
    }
    if (typeof arg === 'object') {
      defaults(this.options, arg);
    } else if (typeof arg === 'string') {
      defaults(this.options, parseURL(arg));
    } else if (typeof arg === 'number') {
      this.options.port = arg;
    } else {
      throw new Error('Invalid argument ' + arg);
    }
  }
  defaults(this.options, Redis.defaultOptions);

  if (typeof this.options.port === 'string') {
    this.options.port = parseInt(this.options.port, 10);
  }
  if (typeof this.options.db === 'string') {
    this.options.db = parseInt(this.options.db, 10);
  }
  if (this.options.parser === 'hiredis') {
    console.warn('Hiredis parser is abandoned since ioredis v3.0, and JavaScript parser will be used');
  }
};

/**
 * Change instance's status
 * @private
 */
Redis.prototype.setStatus = function (status, arg) {
  // @ts-ignore
  if (debug.enabled) {
    debug('status[%s]: %s -> %s', this._getDescription(), this.status || '[empty]', status);
  }
  this.status = status;
  process.nextTick(this.emit.bind(this, status, arg));
};

/**
 * Create a connection to Redis.
 * This method will be invoked automatically when creating a new Redis instance
 * unless `lazyConnect: true` is passed.
 *
 * When calling this method manually, a Promise is returned, which will
 * be resolved when the connection status is ready.
 * @param {function} [callback]
 * @return {Promise<void>}
 * @public
 */
Redis.prototype.connect = function (callback) {
  var _Promise = PromiseContainer.get();
  var promise = new _Promise((resolve, reject) => {
    if (this.status === 'connecting' || this.status === 'connect' || this.status === 'ready') {
      reject(new Error('Redis is already connecting/connected'));
      return;
    }
    this.setStatus('connecting');

    const {options} = this;

    this.condition = {
      select: options.db,
      auth: options.password,
      subscriber: false
    };

    var _this = this;
    asCallback(this.connector.connect(function (type, err) {
      _this.silentEmit(type, err);
    }), function (err, stream) {
      if (err) {
        _this.flushQueue(err);
        _this.silentEmit('error', err);
        reject(err);
        _this.setStatus('end');
        return;
      }
      var CONNECT_EVENT = options.tls ? 'secureConnect' : 'connect';
      if (options.sentinels && !options.enableTLSForSentinelMode) {
        CONNECT_EVENT = 'connect';
      }

      _this.stream = stream;
      if (typeof options.keepAlive === 'number') {
        stream.setKeepAlive(true, options.keepAlive);
      }

      stream.once(CONNECT_EVENT, eventHandler.connectHandler(_this));
      stream.once('error', eventHandler.errorHandler(_this));
      stream.once('close', eventHandler.closeHandler(_this));

      if (options.connectTimeout) {
        /*
         * Typically, Socket#setTimeout(0) will clear the timer
         * set before. However, in some platforms (Electron 3.x~4.x),
         * the timer will not be cleared. So we introduce a variable here.
         *
         * See https://github.com/electron/electron/issues/14915
         */
        var connectTimeoutCleared = false;
        stream.setTimeout(options.connectTimeout, function () {
          if (connectTimeoutCleared) {
            return;
          }
          stream.setTimeout(0);
          stream.destroy();

          var err = new Error('connect ETIMEDOUT');
          // @ts-ignore
          err.errorno = 'ETIMEDOUT';
          // @ts-ignore
          err.code = 'ETIMEDOUT';
          // @ts-ignore
          err.syscall = 'connect';
          eventHandler.errorHandler(_this)(err);
        });
        stream.once(CONNECT_EVENT, function () {
          connectTimeoutCleared = true;
          stream.setTimeout(0);
        });
      }

      if (options.noDelay) {
        stream.setNoDelay(true);
      }

      var connectionReadyHandler = function () {
        _this.removeListener('close', connectionCloseHandler);
        resolve();
      };
      var connectionCloseHandler = function () {
        _this.removeListener('ready', connectionReadyHandler);
        reject(new Error(CONNECTION_CLOSED_ERROR_MSG));
      };
      _this.once('ready', connectionReadyHandler);
      _this.once('close', connectionCloseHandler);
    });
  })

  return asCallback(promise, callback)
};

/**
 * Disconnect from Redis.
 *
 * This method closes the connection immediately,
 * and may lose some pending replies that haven't written to client.
 * If you want to wait for the pending replies, use Redis#quit instead.
 * @public
 */
Redis.prototype.disconnect = function (reconnect) {
  if (!reconnect) {
    this.manuallyClosing = true;
  }
  if (this.reconnectTimeout) {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
  }
  if (this.status === 'wait') {
    eventHandler.closeHandler(this)();
  } else {
    this.connector.disconnect();
  }
};

/**
 * Disconnect from Redis.
 *
 * @deprecated
 */
Redis.prototype.end = function () {
  this.disconnect();
};

/**
 * Create a new instance with the same options as the current one.
 *
 * @example
 * ```js
 * var redis = new Redis(6380);
 * var anotherRedis = redis.duplicate();
 * ```
 *
 * @public
 */
Redis.prototype.duplicate = function (override) {
  return new Redis(Object.assign({}, this.options, override || {}));
};

Redis.prototype.recoverFromFatalError = function (commandError, err, options) {
  this.flushQueue(err, options);
  this.silentEmit('error', err);
  this.disconnect(true);
}

Redis.prototype.handleReconnection = function handleReconnection(err, item) {
  var needReconnect: ReturnType<ReconnectOnError> = false;
  if (this.options.reconnectOnError) {
    needReconnect = this.options.reconnectOnError(err);
  }

  switch (needReconnect) {
  case 1:
  case true:
    if (this.status !== 'reconnecting') {
      this.disconnect(true);
    }
    item.command.reject(err);
    break;
  case 2:
    if (this.status !== 'reconnecting') {
      this.disconnect(true);
    }
    if (this.condition.select !== item.select && item.command.name !== 'select') {
      this.select(item.select);
    }
    this.sendCommand(item.command);
    break;
  default:
    item.command.reject(err);
  }
}

/**
 * Flush offline queue and command queue with error.
 *
 * @param {Error} error - The error object to send to the commands
 * @param {object} options
 * @private
 */
Redis.prototype.flushQueue = function (error, options) {
  options = defaults({}, options, {
    offlineQueue: true,
    commandQueue: true
  });

  var item;
  if (options.offlineQueue) {
    while (this.offlineQueue.length > 0) {
      item = this.offlineQueue.shift();
      item.command.reject(error);
    }
  }

  if (options.commandQueue) {
    if (this.commandQueue.length > 0) {
      if (this.stream) {
        this.stream.removeAllListeners('data');
      }
      while (this.commandQueue.length > 0) {
        item = this.commandQueue.shift();
        item.command.reject(error);
      }
    }
  }
};

/**
 * Check whether Redis has finished loading the persistent data and is able to
 * process commands.
 *
 * @param {Function} callback
 * @private
 */
Redis.prototype._readyCheck = function (callback) {
  var _this = this;
  this.info(function (err, res) {
    if (err) {
      return callback(err);
    }
    if (typeof res !== 'string') {
      return callback(null, res);
    }

    var info: {[key: string]: any} = {};

    var lines = res.split('\r\n');
    for (var i = 0; i < lines.length; ++i) {
      var parts = lines[i].split(':');
      if (parts[1]) {
        info[parts[0]] = parts[1];
      }
    }

    if (!info.loading || info.loading === '0') {
      callback(null, info);
    } else {
      var loadingEtaMs = (info.loading_eta_seconds || 1) * 1000;
      var retryTime = _this.options.maxLoadingRetryTime && _this.options.maxLoadingRetryTime < loadingEtaMs
        ? _this.options.maxLoadingRetryTime
        : loadingEtaMs
      debug('Redis server still loading, trying again in ' + retryTime + 'ms');
      setTimeout(function () {
        _this._readyCheck(callback);
      }, retryTime);
    }
  });
};

/**
 * Emit only when there's at least one listener.
 *
 * @param {string} eventName - Event to emit
 * @param {...*} arguments - Arguments
 * @return {boolean} Returns true if event had listeners, false otherwise.
 * @private
 */
Redis.prototype.silentEmit = function (eventName) {
  var error;
  if (eventName === 'error') {
    error = arguments[1];

    if (this.status === 'end') {
      return;
    }

    if (this.manuallyClosing) {
      // ignore connection related errors when manually disconnecting
      if (error instanceof Error && (
        error.message === CONNECTION_CLOSED_ERROR_MSG ||
        // @ts-ignore
        error.syscall === 'connect' ||
        // @ts-ignore
        error.syscall === 'read'
      )){
        return;
      }
    }
  }
  if (this.listeners(eventName).length > 0) {
    return this.emit.apply(this, arguments);
  }
  if (error && error instanceof Error) {
    console.error('[ioredis] Unhandled error event:', error.stack);
  }
  return false;
};

/**
 * Listen for all requests received by the server in real time.
 *
 * This command will create a new connection to Redis and send a
 * MONITOR command via the new connection in order to avoid disturbing
 * the current connection.
 *
 * @param {function} [callback] The callback function. If omit, a promise will be returned.
 * @example
 * ```js
 * var redis = new Redis();
 * redis.monitor(function (err, monitor) {
 *   // Entering monitoring mode.
 *   monitor.on('monitor', function (time, args, source, database) {
 *     console.log(time + ": " + util.inspect(args));
 *   });
 * });
 *
 * // supports promise as well as other commands
 * redis.monitor().then(function (monitor) {
 *   monitor.on('monitor', function (time, args, source, database) {
 *     console.log(time + ": " + util.inspect(args));
 *   });
 * });
 * ```
 * @public
 */
Redis.prototype.monitor = function (callback) {
  var monitorInstance = this.duplicate({
    monitor: true,
    lazyConnect: false
  });

  var Promise = PromiseContainer.get();
  return asCallback(
    new Promise(function (resolve) {
      monitorInstance.once('monitoring', function () {
        resolve(monitorInstance);
      });
    }),
    callback
  );
};

addTransactionSupport(Redis.prototype);

/**
 * Send a command to Redis
 *
 * This method is used internally by the `Redis#set`, `Redis#lpush` etc.
 * Most of the time you won't invoke this method directly.
 * However when you want to send a command that is not supported by ioredis yet,
 * this command will be useful.
 *
 * @method sendCommand
 * @memberOf Redis#
 * @param {Command} command - The Command instance to send.
 * @see {@link Command}
 * @example
 * ```js
 * var redis = new Redis();
 *
 * // Use callback
 * var get = new Command('get', ['foo'], 'utf8', function (err, result) {
 *   console.log(result);
 * });
 * redis.sendCommand(get);
 *
 * // Use promise
 * var set = new Command('set', ['foo', 'bar'], 'utf8');
 * set.promise.then(function (result) {
 *   console.log(result);
 * });
 * redis.sendCommand(set);
 * ```
 * @private
 */
Redis.prototype.sendCommand = function (command, stream) {
  if (this.status === 'wait') {
    this.connect().catch(noop);
  }
  if (this.status === 'end') {
    command.reject(new Error(CONNECTION_CLOSED_ERROR_MSG));
    return command.promise;
  }
  if (this.condition.subscriber && !Command.checkFlag('VALID_IN_SUBSCRIBER_MODE', command.name)) {
    command.reject(new Error('Connection in subscriber mode, only subscriber commands may be used'));
    return command.promise;
  }

  var writable = (this.status === 'ready') ||
    (!stream && (this.status === 'connect') && commands.hasFlag(command.name, 'loading'));
  if (!this.stream) {
    writable = false;
  } else if (!this.stream.writable) {
    writable = false;
  } else if (this.stream._writableState && this.stream._writableState.ended) {
    // https://github.com/iojs/io.js/pull/1217
    writable = false;
  }

  if (!writable && !this.options.enableOfflineQueue) {
    command.reject(new Error('Stream isn\'t writeable and enableOfflineQueue options is false'));
    return command.promise;
  }

  if (!writable && command.name === 'quit' && this.offlineQueue.length === 0) {
    this.disconnect();
    command.resolve(Buffer.from('OK'));
    return command.promise;
  }

  if (writable) {
    // @ts-ignore
    if (debug.enabled) {
      debug('write command[%s]: %d -> %s(%o)', this._getDescription(), this.condition.select, command.name, command.args);
    }
    (stream || this.stream).write(command.toWritable());

    this.commandQueue.push({
      command: command,
      stream: stream,
      select: this.condition.select
    });

    if (Command.checkFlag('WILL_DISCONNECT', command.name)) {
      this.manuallyClosing = true;
    }
  } else if (this.options.enableOfflineQueue) {
    // @ts-ignore
    if (debug.enabled) {
      debug('queue command[%s]: %d -> %s(%o)', this._getDescription(), this.condition.select, command.name, command.args);
    }
    this.offlineQueue.push({
      command: command,
      stream: stream,
      select: this.condition.select
    });
  }

  if (command.name === 'select' && isInt(command.args[0])) {
    var db = parseInt(command.args[0], 10);
    if (this.condition.select !== db) {
      this.condition.select = db;
      this.emit('select', db);
      debug('switch to db [%d]', this.condition.select);
    }
  }

  return command.promise;
};

/**
 * Get description of the connection. Used for debugging.
 * @private
 */
Redis.prototype._getDescription = function () {
  let description;
  if (this.options.path) {
    description = this.options.path;
  } else if (this.stream && this.stream.remoteAddress && this.stream.remotePort) {
    description = this.stream.remoteAddress + ':' + this.stream.remotePort;
  } else {
    description = this.options.host + ':' + this.options.port;
  }
  if (this.options.connectionName) {
    description += ` (${this.options.connectionName})`
  }
  return description
};

['scan', 'sscan', 'hscan', 'zscan', 'scanBuffer', 'sscanBuffer', 'hscanBuffer', 'zscanBuffer']
.forEach(function (command) {
  Redis.prototype[command + 'Stream'] = function (key, options) {
    if (command === 'scan' || command === 'scanBuffer') {
      options = key;
      key = null;
    }
    return new ScanStream(defaults({
      objectMode: true,
      key: key,
      redis: this,
      command: command
    }, options));
  };
});
