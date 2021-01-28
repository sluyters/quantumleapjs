import { w3cwebsocket as W3CWebSocket } from "websocket";
import ReconnectingWebSocket from 'reconnecting-websocket';
import EventEmitter from 'events';

/**
 * @extends EventEmitter
 */
class GestureHandler extends EventEmitter {
  /**
   * @constructor
   * @param {Object} [options] - A list of options.
   * @param {number} [options.timeout=10000] - The maximum time in milliseconds to wait for a connection to succeed before closing and retrying.
   * @param {number} [options.interval=3000] - The number of milliseconds between two reconnection attempts.
   * @param {boolean} [options.requireRegistration=true] - If set to true, gesture events are only triggered for recognized gesture that have been registered using the registerGesture method. If set to false, gesture events are triggered for any recognized gestures.
   */
  constructor({ timeout = 10000, interval = 3000, requireRegistration = true } = {}) {
    super();
    this.timeout = timeout;
    this.interval = interval;
    this.requireRegistration = requireRegistration;
    this._registeredGestures = {
      static: [],
      dynamic: [],
    };
    // True if the interface is connected to the server
    this._connected = false;
    // The websocket client
    this._client = null;
  }

  /**
   * Register gestures to the QuantumLeap framework.
   * @param {('static' | 'dynamic')} type - The type of gesture.
   * @param {(string|Array.<string>)} names - The gesture(s) to register.
   */
  registerGestures(type, names) {
    if (this._registeredGestures.hasOwnProperty(type)) {
      names = [].concat(names || []);
      names = names.filter((name) => !this._registeredGestures[type].includes(name));
      this._registeredGestures[type] = this._registeredGestures[type].concat(names);
      if (this._connected) {
        this._registerGestures(type, names);
      }
    }
  }

  /**
   * Unregister gestures from the QuantumLeap framework.
   * @param {('static' | 'dynamic')} type - The type of gesture.
   * @param {(string|Array.<string>)} names - The gesture(s) to unregister.
   */
  unregisterGestures(type, names) {
    if (this._registeredGestures.hasOwnProperty(type)) {
      names = [].concat(names || []);
      let removedNames = [];
      this._registeredGestures[type] = this._registeredGestures[type].filter((name) => {
        if (names.includes(name)) {
          removedNames.push(name);
          return false;
        } else {
          return true;
        }
      });
      if (this._connected) {
        this._unregisterGestures(type, removedNames);
      }
    }
  }

  /**
   * Connect to the QuantumLeap framework.
   * @param {string} [addr='ws://127.0.0.1:6442'] - The address of a running instance of QuantumLeap framework.
   */
  connect(addr = 'ws://127.0.0.1:6442') {
    if (this._client) {
      console.error('Already connected!');
      return;
    }
    this._client = new ReconnectingWebSocket(addr, [], {
      constructor: W3CWebSocket,
      connectionTimeout: this.timeout,  // in milliseconds
      reconnectInterval: this.interval
    });
    // Handle connection opened
    this._client.onopen = () => {
      this._connected = true;
      this.emit('connect', new ConnectEvent())
      // Register static and dynamic gestures
      this._registerGestures('static', this._registeredGestures.static);
      this._registerGestures('dynamic', this._registeredGestures.dynamic);
    };
    // Handle messages from the server
    this._client.onmessage = (e) => {
      let msg = JSON.parse(e.data);
      if (msg.type === 'data' && msg.data.length > 0) {
        let frame = {};
        let i = 0;
        if (msg.data[i].type === 'frame') {
          // Frame
          frame = msg.data[i].data;
          this.emit('frame', new FrameEvent(frame))
          i++;
        }
        for (; i < msg.data.length; i++) {
          let data = msg.data[i];
          if (data.type === 'static' || data.type === 'dynamic') {
            // Gesture
            if (!this.requireRegistration || this._registeredGestures[data.type].includes(data.name)) {
              this.emit('gesture', new GestureEvent({ type: data.type, name: data.name, data: data.data }, frame));
            }
          }
        }
      }
    };
    // Handle errors
    this._client.onerror = (e) => {
      this.emit('error', new ErrorEvent(e))
    }
    // Handle close
    this._client.onclose = (e) => {
      this._connected = false
      this.emit('disconnect', new DisconnectEvent(e));
    }
  }

  /**
   * Disconnect from the QuantumLeap framework.
   */
  disconnect() {
    if (this._client) {
      this._client.close();
    }
    this._connected = false;
    this._client = null;
  }

  // Private methods
  _registerGestures(type, names) {
    let data = [];
    if (type === 'static') {
      names.forEach((name) => {
        data.push({ type: 'addPose', name: name });
      })
    } else {
      names.forEach((name) => {
        data.push({ type: 'addGesture', name: name });
      })
    }
    if (data.length > 0) {
      let message = { type: 'operation', data: data }
      this._client.send(JSON.stringify(message));
    }
  }

  _unregisterGestures(type, names) {
    let data = [];
    if (type === 'static') {
      names.forEach((name) => {
        data.push({ type: 'removePose', name: name });
      })
    } else {
      names.forEach((name) => {
        data.push({ type: 'removeGesture', name: name });
      })
    }
    if (data.length > 0) {
      let message = { type: 'operation', data: data }
      this._client.send(JSON.stringify(message));
    }
  }
}

// Events
class FrameEvent {
  constructor(frame = {}) {
    this.frame = frame;
  }
  toString() {
    return JSON.stringify(this.data);
  }
}

class GestureEvent {
  constructor(gesture = {}, frame = {}) {
    this.type = 'gesture';
    this.gesture = gesture;
    this.frame = frame
  }
  toString() {
    return `${this.type} - ${this.name} - ${JSON.stringify(this.data)}`;
  }
}

class ConnectEvent {
  constructor(message) {
    this.type = 'connect';
    this.message = message;
  }
  toString() {
    return this.message;
  }
}

class DisconnectEvent {
  constructor(message) {
    this.type = 'disconnect';
    this.message = message;
  }
  toString() {
    return this.message;
  }
}

class ErrorEvent {
  constructor(message) {
    this.type = 'error';
    this.message = message;
  }
  toString() {
    return this.message;
  }
}

export default GestureHandler