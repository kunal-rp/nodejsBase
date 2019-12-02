var logger = require('./logger.js').MAIN_LOGGER
var methodLogger = require('./logger.js').METHOD_LOGGER
var automatedSystemLogger = require('./logger').AUTOMATED_SYSTEM_LOGGER

/**
 * Creates the 'baton' object holding all general info for the session functions
 * Original Callback will be stored, and method sequence will be stored, along with error
 * uses 'call-by-sharing' ; like call-by-reference, but only for properties of objects
 */

module.exports = {

  createBaton(id, method, params, res) {
    var t = this;
    var time = new Date();
    return {
      //id to reference detail log
      id: id,
      start_time: time.getTime(),
      err: [],
      //the res for the request
      res: res,
      requestType: "GET",
      params: params,
      user_id: null,
      sendError: function(data, errorCode) {
        this.lastMethod();
        res.status((errorCode ? errorCode : 500)).json(data)
      },
      json: function(data) {
        var end_time = new Date()
        this.duration = end_time.getTime() - this.start_time
        this.lastMethod()
        logger.info(this.printable())
        res.setHeader("Set-Cookie", "HttpOnly;Secure;SameSite=Strict");
        res.status((this.requestType == "GET" ? 200 : 201)).json(data)
      },
      endpoint: method,
      //database limit records flag
      //attr: table named
      //value: {offset : offset section number, order_attr: attr to order results by }
      db_limit: {},
      //method sequence
      methods: [],
      addMethod: function(meth) {
        if (this.methods.length == 0) {
          this.methods.push({
            correlation_id: this.id,
            method: meth,
            time: new Date().getTime()
          })
        } else {
          this.methods[this.methods.length - 1].duration = new Date().getTime() - this.methods[this.methods.length - 1].time
          delete this.methods[this.methods.length - 1].time
          methodLogger.info(this.methods[this.methods.length - 1])
          this.methods.push({
            correlation_id: this.id,
            method: meth,
            time: new Date().getTime()
          })
        }
      },
      lastMethod: function() {
        if (this.methods.length > 0) {
          this.methods[this.methods.length - 1].duration = new Date().getTime() - this.methods[this.methods.length - 1].time
          delete this.methods[this.methods.length - 1].time
          methodLogger.info(this.methods[this.methods.length - 1])
        }
      },
      //the error object & public message to display
      setError: function(error) {
        var end_time = new Date()
        this.duration = end_time.getTime() - this.start_time
        this.err.push(error);
      },
      printable: function() {
        return t._getPrintableBaton(this)
      }
    }
  },

  //this is the special baton created for automated tasks
  //since there is no endpoint call
  createAutomatedBaton(id, task_name, end_callback) {
    var t = this;
    var time = new Date();
    return {
      automated_task_name: task_name,
      //id to reference detail log
      id: id,
      start_time: time.getTime(),
      err: [],
      //the res for the request
      sendError: function(data, errorCode) {
        automatedSystemLogger.error(this.printable())
        this.lastMethod();
        res.status((errorCode ? errorCode : 500)).json(data)
      },
      methods: [],
      done: function(data) {
        var end_time = new Date()
        this.duration = end_time.getTime() - this.start_time
        this.lastMethod()
        this.additionalData = data
        automatedSystemLogger.info(this.printable())
        if (end_callback) end_callback(this)
      },
      addMethod: function(meth) {
        if (this.methods.length == 0) {
          this.methods.push({
            correlation_id: this.id,
            method: meth,
            time: new Date().getTime()
          })
        } else {
          this.methods[this.methods.length - 1].duration = new Date().getTime() - this.methods[this.methods.length - 1].time
          delete this.methods[this.methods.length - 1].time
          methodLogger.info(this.methods[this.methods.length - 1])
          this.methods.push({
            correlation_id: this.id,
            method: meth,
            time: new Date().getTime()
          })
        }
      },
      lastMethod: function() {
        if (this.methods.length > 0) {
          this.methods[this.methods.length - 1].duration = new Date().getTime() - this.methods[this.methods.length - 1].time
          delete this.methods[this.methods.length - 1].time
          methodLogger.info(this.methods[this.methods.length - 1])
        }
      },
      //the error object & public message to display
      setError: function(error) {
        var end_time = new Date()
        this.duration = end_time.getTime() - this.start_time
        this.err.push(error);
      },
      printable: function() {
        return t._getPrintableBaton(this)
      },

    }
  },
  _getPrintableBaton(baton) {
    var printableBaton = {}
    Object.keys(baton).forEach((key) => {
      if (typeof baton[key] !== 'function') printableBaton[key] = baton[key]
    });
    delete printableBaton.methods
    delete printableBaton.res
    return printableBaton
  },
}