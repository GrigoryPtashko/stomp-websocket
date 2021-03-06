// Generated by CoffeeScript 2.0.0
(function() {
  // **STOMP Over Web Socket** is a JavaScript STOMP Client using
  // [HTML5 Web Sockets API](http://www.w3.org/TR/websockets).

  // * Copyright (C) 2010-2012 [Jeff Mesnil](http://jmesnil.net/)
  // * Copyright (C) 2012 [FuseSource, Inc.](http://fusesource.com)

  // This library supports:

  // * [STOMP 1.0](http://stomp.github.com/stomp-specification-1.0.html)
  // * [STOMP 1.1](http://stomp.github.com/stomp-specification-1.1.html)

  // The library is accessed through the `Stomp` object that is set on the `window`
  // when running in a Web browser.
  var Byte, Client, Frame, Stomp,
    hasProp = {}.hasOwnProperty;

  /*
     Stomp Over WebSocket http://www.jmesnil.net/stomp-websocket/doc/ | Apache License V2.0

     Copyright (C) 2010-2013 [Jeff Mesnil](http://jmesnil.net/)
     Copyright (C) 2012 [FuseSource, Inc.](http://fusesource.com)
  */
  // Define constants for bytes used throughout the code.
  Byte = {
    // LINEFEED byte (octet 10)
    LF: '\x0A',
    // NULL byte (octet 0)
    NULL: '\x00'
  };

  // ##[STOMP Frame](http://stomp.github.com/stomp-specification-1.1.html#STOMP_Frames) Class
  Frame = (function() {
    var unmarshallSingle;

    class Frame {
      // Frame constructor
      constructor(command1, headers1 = {}, body1 = '') {
        this.command = command1;
        this.headers = headers1;
        this.body = body1;
      }

      // Provides a textual representation of the frame
      // suitable to be sent to the server
      toString() {
        var lines, name, ref, skipContentLength, value;
        lines = [this.command];
        skipContentLength = (this.headers['content-length'] === false) ? true : false;
        if (skipContentLength) {
          delete this.headers['content-length'];
        }
        ref = this.headers;
        for (name in ref) {
          if (!hasProp.call(ref, name)) continue;
          value = ref[name];
          lines.push(`${name}:${value}`);
        }
        if (this.body && !skipContentLength) {
          lines.push(`content-length:${Frame.sizeOfUTF8(this.body)}`);
        }
        lines.push(Byte.LF + this.body);
        return lines.join(Byte.LF);
      }

      // Compute the size of a UTF-8 string by counting its number of bytes
      // (and not the number of characters composing the string)
      static sizeOfUTF8(s) {
        if (s) {
          return encodeURI(s).match(/%..|./g).length;
        } else {
          return 0;
        }
      }

      // Split the data before unmarshalling every single STOMP frame.
      // Web socket servers can send multiple frames in a single websocket message.
      // If the message size exceeds the websocket message size, then a single
      // frame can be fragmented across multiple messages.

      // `datas` is a string.

      // returns an *array* of Frame objects
      static unmarshall(datas) {
        var frame, frames, last_frame, r;
        // Ugly list comprehension to split and unmarshall *multiple STOMP frames*
        // contained in a *single WebSocket frame*.
        // The data is split when a NULL byte (followed by zero or many LF bytes) is
        // found
        frames = datas.split(RegExp(`${Byte.NULL}${Byte.LF}*`));
        r = {
          frames: [],
          partial: ''
        };
        r.frames = (function() {
          var j, len1, ref, results;
          ref = frames.slice(0, -1);
          results = [];
          for (j = 0, len1 = ref.length; j < len1; j++) {
            frame = ref[j];
            results.push(unmarshallSingle(frame));
          }
          return results;
        })();
        // If this contains a final full message or just a acknowledgement of a PING
        // without any other content, process this frame, otherwise return the
        // contents of the buffer to the caller.
        last_frame = frames.slice(-1)[0];
        if (last_frame === Byte.LF || (last_frame.search(RegExp(`${Byte.NULL}${Byte.LF}*$`))) !== -1) {
          r.frames.push(unmarshallSingle(last_frame));
        } else {
          r.partial = last_frame;
        }
        return r;
      }

      // Marshall a Stomp frame
      static marshall(command, headers, body) {
        var frame;
        frame = new Frame(command, headers, body);
        return frame.toString() + Byte.NULL;
      }

    };

    // Unmarshall a single STOMP frame from a `data` string
    unmarshallSingle = function(data) {
      var body, chr, command, divider, headerLines, headers, i, idx, j, k, len, len1, line, ref, ref1, ref2, start, trim;
      // search for 2 consecutives LF byte to split the command
      // and headers from the body
      divider = data.search(RegExp(`${Byte.LF}${Byte.LF}`));
      headerLines = data.substring(0, divider).split(Byte.LF);
      command = headerLines.shift();
      headers = {};
      // utility function to trim any whitespace before and after a string
      trim = function(str) {
        return str.replace(/^\s+|\s+$/g, '');
      };
      ref = headerLines.reverse();
      // Parse headers in reverse order so that for repeated headers, the 1st
      // value is used
      for (j = 0, len1 = ref.length; j < len1; j++) {
        line = ref[j];
        idx = line.indexOf(':');
        headers[trim(line.substring(0, idx))] = trim(line.substring(idx + 1));
      }
      // Parse body
      // check for content-length or  topping at the first NULL byte found.
      body = '';
      // skip the 2 LF bytes that divides the headers from the body
      start = divider + 2;
      if (headers['content-length']) {
        len = parseInt(headers['content-length']);
        body = ('' + data).substring(start, start + len);
      } else {
        chr = null;
        for (i = k = ref1 = start, ref2 = data.length; ref1 <= ref2 ? k < ref2 : k > ref2; i = ref1 <= ref2 ? ++k : --k) {
          chr = data.charAt(i);
          if (chr === Byte.NULL) {
            break;
          }
          body += chr;
        }
      }
      return new Frame(command, headers, body);
    };

    return Frame;

  })();

  // ##STOMP Client Class

  // All STOMP protocol is exposed as methods of this class (`connect()`,
  // `send()`, etc.)
  Client = (function() {
    var now;

    class Client {
      constructor(ws1) {
        this.ws = ws1;
        this.ws.binaryType = "arraybuffer";
        // used to index subscribers
        this.counter = 0;
        this.connected = false;
        // Heartbeat properties of the client
        this.heartbeat = {
          // send heartbeat every 10s by default (value is in ms)
          outgoing: 10000,
          // expect to receive server heartbeat at least every 10s by default
          // (value in ms)
          incoming: 10000
        };
        // maximum *WebSocket* frame size sent by the client. If the STOMP frame
        // is bigger than this value, the STOMP frame will be sent using multiple
        // WebSocket frames (default is 16KiB)
        this.maxWebSocketFrameSize = 16 * 1024;
        // subscription callbacks indexed by subscriber's ID
        this.subscriptions = {};
        this.partialData = '';
      }

      // ### Debugging

      // By default, debug messages are logged in the window's console if it is defined.
      // This method is called for every actual transmission of the STOMP frames over the
      // WebSocket.

      // It is possible to set a `debug(message)` method
      // on a client instance to handle differently the debug messages:

      //     client.debug = function(str) {
      //         // append the debug log to a #debug div
      //         $("#debug").append(str + "\n");
      //     };
      debug(message) {
        var ref;
        return typeof window !== "undefined" && window !== null ? (ref = window.console) != null ? ref.log(message) : void 0 : void 0;
      }

      // Base method to transmit any stomp frame
      _transmit(command, headers, body) {
        var out, outPart;
        out = Frame.marshall(command, headers, body);
        if (typeof this.debug === "function") {
          this.debug(">>> " + out);
        }
        // if necessary, split the *STOMP* frame to send it on many smaller
        // *WebSocket* frames
        while (true) {
          if (out.length > this.maxWebSocketFrameSize) {
            outPart = out.substring(0, this.maxWebSocketFrameSize);
            if (this.ws.readyState === WebSocket.OPEN) {
              this.ws.send((new Uint8Array([].map.call(outPart, function(x) {
                return x.charCodeAt(0);
              }))).buffer);
              out = out.substring(this.maxWebSocketFrameSize);
              if (typeof this.debug === "function") {
                this.debug("remaining = " + out.length);
              }
            } else {
              if (typeof this.debug === "function") {
                this.debug("wrong ws readyState 1");
              }
              if (typeof errorCallback === "function") {
                errorCallback("wrong ws readyState 1");
              }
              break;
            }
          } else {
            if (this.ws.readyState === WebSocket.OPEN) {
              return this.ws.send((new Uint8Array([].map.call(out, function(x) {
                return x.charCodeAt(0);
              }))).buffer);
            } else {
              if (typeof this.debug === "function") {
                this.debug("wrong ws readyState 2");
              }
              if (typeof errorCallback === "function") {
                errorCallback("wrong ws readyState 2");
              }
              return;
            }
          }
        }
      }

      // Heart-beat negotiation
      _setupHeartbeat(headers) {
        var ref, serverIncoming, serverOutgoing, ttl, v;
        if ((ref = headers.version) !== Stomp.VERSIONS.V1_1 && ref !== Stomp.VERSIONS.V1_2) {
          return;
        }
        // heart-beat header received from the server looks like:

        //     heart-beat: sx, sy
        [serverOutgoing, serverIncoming] = (function() {
          var j, len1, ref1, results;
          ref1 = headers['heart-beat'].split(",");
          results = [];
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            v = ref1[j];
            results.push(parseInt(v));
          }
          return results;
        })();
        if (!(this.heartbeat.outgoing === 0 || serverIncoming === 0)) {
          ttl = Math.max(this.heartbeat.outgoing, serverIncoming);
          if (typeof this.debug === "function") {
            this.debug(`send PING every ${ttl}ms`);
          }
          // The `Stomp.setInterval` is a wrapper to handle regular callback
          // that depends on the runtime environment (Web browser or node.js app)
          this.pinger = Stomp.setInterval(ttl, () => {
            if (this.ws.readyState === WebSocket.OPEN) {
              this.ws.send((new Uint8Array([].map.call(Byte.LF, function(x) {
                return x.charCodeAt(0);
              }))).buffer);
              return typeof this.debug === "function" ? this.debug(">>> PING") : void 0;
            } else {
              if (typeof this.debug === "function") {
                this.debug("wrong ws readyState 3");
              }
              return typeof errorCallback === "function" ? errorCallback("wrong ws readyState 3") : void 0;
            }
          });
        }
        if (!(this.heartbeat.incoming === 0 || serverOutgoing === 0)) {
          ttl = Math.max(this.heartbeat.incoming, serverOutgoing);
          if (typeof this.debug === "function") {
            this.debug(`check PONG every ${ttl}ms`);
          }
          return this.ponger = Stomp.setInterval(ttl, () => {
            var delta;
            delta = now() - this.serverActivity;
            // We wait twice the TTL to be flexible on window's setInterval calls
            if (delta > ttl * 2) {
              if (typeof this.debug === "function") {
                this.debug(`did not receive server activity for the last ${delta}ms`);
              }
              return this.ws.close();
            }
          });
        }
      }

      // parse the arguments number and type to find the headers, connectCallback and
      // (eventually undefined) errorCallback
      _parseConnect(...args) {
        var connectCallback, errorCallback, headers;
        headers = {};
        switch (args.length) {
          case 2:
            [headers, connectCallback] = args;
            break;
          case 3:
            if (args[1] instanceof Function) {
              [headers, connectCallback, errorCallback] = args;
            } else {
              [headers.login, headers.passcode, connectCallback] = args;
            }
            break;
          case 4:
            [headers.login, headers.passcode, connectCallback, errorCallback] = args;
            break;
          default:
            [headers.login, headers.passcode, connectCallback, errorCallback, headers.host] = args;
        }
        return [headers, connectCallback, errorCallback];
      }

      // [CONNECT Frame](http://stomp.github.com/stomp-specification-1.1.html#CONNECT_or_STOMP_Frame)

      // The `connect` method accepts different number of arguments and types:

      // * `connect(headers, connectCallback)`
      // * `connect(headers, connectCallback, errorCallback)`
      // * `connect(login, passcode, connectCallback)`
      // * `connect(login, passcode, connectCallback, errorCallback)`
      // * `connect(login, passcode, connectCallback, errorCallback, host)`

      // The errorCallback is optional and the 2 first forms allow to pass other
      // headers in addition to `client`, `passcode` and `host`.
      connect(...args) {
        var errorCallback, headers, out;
        out = this._parseConnect(...args);
        [headers, this.connectCallback, errorCallback] = out;
        //    @debug? "Opening Web Socket..."
        this.ws.onmessage = (evt) => {
          var arr, c, client, data, frame, j, len1, messageID, onreceive, ref, results, subscription, unmarshalledData;
          // the data is stored inside an ArrayBuffer, we decode it to get the
          // data as a String
          data = typeof ArrayBuffer !== 'undefined' && evt.data instanceof ArrayBuffer ? (arr = new Uint8Array(evt.data), typeof this.debug === "function" ? this.debug(`--- got data length: ${arr.length}`) : void 0, ((function() {
            var j, len1, results;
            results = [];
            for (j = 0, len1 = arr.length; j < len1; j++) {
              c = arr[j];
              // Return a string formed by all the char codes stored in the Uint8array
              results.push(String.fromCharCode(c));
            }
            return results;
          // take the data directly from the WebSocket `data` field
          })()).join('')) : evt.data;
          this.serverActivity = now();
          if (data === Byte.LF) { // heartbeat
            if (typeof this.debug === "function") {
              this.debug("<<< PONG");
            }
            return;
          }
          if (typeof this.debug === "function") {
            this.debug(`<<< ${data}`);
          }
          // Handle STOMP frames received from the server
          // The unmarshall function returns the frames parsed and any remaining
          // data from partial frames.
          unmarshalledData = Frame.unmarshall(this.partialData + data);
          this.partialData = unmarshalledData.partial;
          ref = unmarshalledData.frames;
          results = [];
          for (j = 0, len1 = ref.length; j < len1; j++) {
            frame = ref[j];
            switch (frame.command) {
              // [CONNECTED Frame](http://stomp.github.com/stomp-specification-1.1.html#CONNECTED_Frame)
              case "CONNECTED":
                if (typeof this.debug === "function") {
                  this.debug(`connected to server ${frame.headers.server}`);
                }
                this.connected = true;
                this._setupHeartbeat(frame.headers);
                results.push(typeof this.connectCallback === "function" ? this.connectCallback(frame) : void 0);
                break;
              // [MESSAGE Frame](http://stomp.github.com/stomp-specification-1.1.html#MESSAGE)
              case "MESSAGE":
                // the `onreceive` callback is registered when the client calls
                // `subscribe()`.
                // If there is registered subscription for the received message,
                // we used the default `onreceive` method that the client can set.
                // This is useful for subscriptions that are automatically created
                // on the browser side (e.g. [RabbitMQ's temporary
                // queues](http://www.rabbitmq.com/stomp.html)).
                subscription = frame.headers.subscription;
                onreceive = this.subscriptions[subscription] || this.onreceive;
                if (onreceive) {
                  client = this;
                  messageID = frame.headers["message-id"];
                  // add `ack()` and `nack()` methods directly to the returned frame
                  // so that a simple call to `message.ack()` can acknowledge the message.
                  frame.ack = (headers = {}) => {
                    return client.ack(messageID, subscription, headers);
                  };
                  frame.nack = (headers = {}) => {
                    return client.nack(messageID, subscription, headers);
                  };
                  results.push(onreceive(frame));
                } else {
                  results.push(typeof this.debug === "function" ? this.debug(`Unhandled received MESSAGE: ${frame}`) : void 0);
                }
                break;
              // [RECEIPT Frame](http://stomp.github.com/stomp-specification-1.1.html#RECEIPT)

              // The client instance can set its `onreceipt` field to a function taking
              // a frame argument that will be called when a receipt is received from
              // the server:

              //     client.onreceipt = function(frame) {
              //       receiptID = frame.headers['receipt-id'];
              //       ...
              //     }
              case "RECEIPT":
                results.push(typeof this.onreceipt === "function" ? this.onreceipt(frame) : void 0);
                break;
              // [ERROR Frame](http://stomp.github.com/stomp-specification-1.1.html#ERROR)
              case "ERROR":
                results.push(typeof errorCallback === "function" ? errorCallback(frame) : void 0);
                break;
              default:
                results.push(typeof this.debug === "function" ? this.debug(`Unhandled frame: ${frame}`) : void 0);
            }
          }
          return results;
        };
        this.ws.onclose = () => {
          var msg;
          msg = `Whoops! Lost connection to ${this.ws.url}`;
          if (typeof this.debug === "function") {
            this.debug(msg);
          }
          this._cleanUp();
          return typeof errorCallback === "function" ? errorCallback(msg) : void 0;
        };
        //    @ws.onopen    = =>
        //    @debug?('Web Socket Opened...')
        headers["accept-version"] = Stomp.VERSIONS.supportedVersions();
        headers["heart-beat"] = [this.heartbeat.outgoing, this.heartbeat.incoming].join(',');
        return this._transmit("CONNECT", headers);
      }

      // [DISCONNECT Frame](http://stomp.github.com/stomp-specification-1.1.html#DISCONNECT)
      disconnect(disconnectCallback, headers = {}) {
        this._transmit("DISCONNECT", headers);
        // Discard the onclose callback to avoid calling the errorCallback when
        // the client is properly disconnected.
        this.ws.onclose = null;
        this.ws.close();
        this._cleanUp();
        return typeof disconnectCallback === "function" ? disconnectCallback() : void 0;
      }

      // Clean up client resources when it is disconnected or the server did not
      // send heart beats in a timely fashion
      _cleanUp() {
        this.connected = false;
        if (this.pinger) {
          Stomp.clearInterval(this.pinger);
        }
        if (this.ponger) {
          return Stomp.clearInterval(this.ponger);
        }
      }

      // [SEND Frame](http://stomp.github.com/stomp-specification-1.1.html#SEND)

      // * `destination` is MANDATORY.
      send(destination, headers = {}, body = '') {
        headers.destination = destination;
        return this._transmit("SEND", headers, body);
      }

      // [SUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#SUBSCRIBE)
      subscribe(destination, callback, headers = {}) {
        var client;
        // for convenience if the `id` header is not set, we create a new one for this client
        // that will be returned to be able to unsubscribe this subscription
        if (!headers.id) {
          headers.id = "sub-" + this.counter++;
        }
        headers.destination = destination;
        this.subscriptions[headers.id] = callback;
        this._transmit("SUBSCRIBE", headers);
        client = this;
        return {
          id: headers.id,
          unsubscribe: function() {
            return client.unsubscribe(headers.id, headers.destination);
          }
        };
      }

      sendForSubscribe(destination, callback, headers = {}, send = true, body = '') {
        var client, command;
        // for convenience if the `id` header is not set, we create a new one for this client
        // that will be returned to be able to unsubscribe this subscription
        if (!headers.id) {
          headers.id = "sub-" + this.counter++;
        }
        headers.destination = destination;
        this.subscriptions[headers.id] = callback;
        command = send ? "SEND" : "SUBSCRIBE";
        this._transmit(command, headers, body);
        client = this;
        return {
          id: headers.id,
          headers: headers,
          body: body,
          callback: callback,
          unsubscribe: function() {
            return client.unsubscribe(headers.id, headers.destination);
          }
        };
      }

      // [UNSUBSCRIBE Frame](http://stomp.github.com/stomp-specification-1.1.html#UNSUBSCRIBE)

      // * `id` is MANDATORY.

      // It is preferable to unsubscribe from a subscription by calling
      // `unsubscribe()` directly on the object returned by `client.subscribe()`:

      //     var subscription = client.subscribe(destination, onmessage);
      //     ...
      //     subscription.unsubscribe();
      unsubscribe(id, destination) {
        delete this.subscriptions[id];
        return this._transmit("UNSUBSCRIBE", {
          id: id,
          destination: destination
        });
      }

      // [BEGIN Frame](http://stomp.github.com/stomp-specification-1.1.html#BEGIN)

      // If no transaction ID is passed, one will be created automatically
      begin(transaction) {
        var client, txid;
        txid = transaction || "tx-" + this.counter++;
        this._transmit("BEGIN", {
          transaction: txid
        });
        client = this;
        return {
          id: txid,
          commit: function() {
            return client.commit(txid);
          },
          abort: function() {
            return client.abort(txid);
          }
        };
      }

      
      // [COMMIT Frame](http://stomp.github.com/stomp-specification-1.1.html#COMMIT)

      // * `transaction` is MANDATORY.

      // It is preferable to commit a transaction by calling `commit()` directly on
      // the object returned by `client.begin()`:

      //     var tx = client.begin(txid);
      //     ...
      //     tx.commit();
      commit(transaction) {
        return this._transmit("COMMIT", {
          transaction: transaction
        });
      }

      
      // [ABORT Frame](http://stomp.github.com/stomp-specification-1.1.html#ABORT)

      // * `transaction` is MANDATORY.

      // It is preferable to abort a transaction by calling `abort()` directly on
      // the object returned by `client.begin()`:

      //     var tx = client.begin(txid);
      //     ...
      //     tx.abort();
      abort(transaction) {
        return this._transmit("ABORT", {
          transaction: transaction
        });
      }

      
      // [ACK Frame](http://stomp.github.com/stomp-specification-1.1.html#ACK)

      // * `messageID` & `subscription` are MANDATORY.

      // It is preferable to acknowledge a message by calling `ack()` directly
      // on the message handled by a subscription callback:

      //     client.subscribe(destination,
      //       function(message) {
      //         // process the message
      //         // acknowledge it
      //         message.ack();
      //       },
      //       {'ack': 'client'}
      //     );
      ack(messageID, subscription, headers = {}) {
        headers["message-id"] = messageID;
        headers.subscription = subscription;
        return this._transmit("ACK", headers);
      }

      // [NACK Frame](http://stomp.github.com/stomp-specification-1.1.html#NACK)

      // * `messageID` & `subscription` are MANDATORY.

      // It is preferable to nack a message by calling `nack()` directly on the
      // message handled by a subscription callback:

      //     client.subscribe(destination,
      //       function(message) {
      //         // process the message
      //         // an error occurs, nack it
      //         message.nack();
      //       },
      //       {'ack': 'client'}
      //     );
      nack(messageID, subscription, headers = {}) {
        headers["message-id"] = messageID;
        headers.subscription = subscription;
        return this._transmit("NACK", headers);
      }

      getServerActivity() {
        return this.serverActivity;
      }

    };

    // Utility method to get the current timestamp (Date.now is not defined in IE8)
    now = function() {
      if (Date.now) {
        return Date.now();
      } else {
        return new Date().valueOf;
      }
    };

    return Client;

  })();

  // ##The `Stomp` Object
  Stomp = {
    VERSIONS: {
      V1_0: '1.0',
      V1_1: '1.1',
      V1_2: '1.2',
      // Versions of STOMP specifications supported
      supportedVersions: function() {
        return '1.1,1.0';
      }
    },
    // This method creates a WebSocket client that is connected to
    // the STOMP server located at the url.
    client: function(url, protocols = ['v10.stomp', 'v11.stomp']) {
      var klass, ws;
      // This is a hack to allow another implementation than the standard
      // HTML5 WebSocket class.

      // It is possible to use another class by calling

      //     Stomp.WebSocketClass = MozWebSocket

      // *prior* to call `Stomp.client()`.

      // This hack is deprecated and  `Stomp.over()` method should be used
      // instead.
      klass = Stomp.WebSocketClass || WebSocket;
      ws = new klass(url, protocols);
      return new Client(ws);
    },
    // This method is an alternative to `Stomp.client()` to let the user
    // specify the WebSocket to use (either a standard HTML5 WebSocket or
    // a similar object).
    over: function(ws) {
      return new Client(ws);
    },
    // For testing purpose, expose the Frame class inside Stomp to be able to
    // marshall/unmarshall frames
    Frame: Frame
  };

  // # `Stomp` object exportation

  // export as CommonJS module
  if (typeof exports !== "undefined" && exports !== null) {
    exports.Stomp = Stomp;
  }

  // export in the Web Browser
  if (typeof window !== "undefined" && window !== null) {
    // in the Web browser, rely on `window.setInterval` to handle heart-beats
    Stomp.setInterval = function(interval, f) {
      return window.setInterval(f, interval);
    };
    Stomp.clearInterval = function(id) {
      return window.clearInterval(id);
    };
    window.Stomp = Stomp;
  } else if (!exports) {
    self.Stomp = Stomp;
  }

}).call(this);
