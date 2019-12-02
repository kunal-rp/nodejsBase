var db = require('./database_actions');
var stub_db = require('./stub_database');
var cred = require('./credentials')
var logger = require('./logger').MAIN_LOGGER
var baton = require('./baton')
var async = require('async');
var http = require('http')

/**

GENERAL DESIGN

Private functions : start with '_'
Direct API functions : start with 'post' or 'get'
  -All such calls will create and pass the 'baton' to following functions
*/

var ID_LENGTH = {
  'testData': 5
}


module.exports = {

  UTC_REGEX: /^\s*(\d{4})-(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)\s+UTC\s*$/,
  convertUtcToEpoch(utc_time) {
    if (utc_time === undefined) return null
    var m = (utc_time).match(this.UTC_REGEX);
    return (m) ? Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]) : null;
  },

  ID_LENGTH: ID_LENGTH,


  get_testGetCall(baton, params, res) {

    var dataLoader = (callback) => {
      this._getTestData(baton, /*params=*/ null, callback)
    }
    dataLoader(test_data => {
      baton.json({
        msg: 'testGetCall good',
        param: params.test_param !== undefined,
        data_details: test_data.length
      })
    })
  },

  post_testPostCall(baton, params, res) {


    this._generateCustomId(baton, /*numberOfIds=*/ 1, /*idLength=*/ ID_LENGTH.testData, '_getTestData', 'id', (testDataId) => {
      this._insertTestData(baton, {
        id: testDataId[0],
        text: params.text
      }, () => {

        baton.json({
          msg: 'testPostCall good',
          id: testDataId
        })

      })
    })
  },

  _getTestData(baton, params, callback) {
    baton.addMethod('getTestData');
    db.getTestData(baton, /*params=*/ params, (data) => {
      this._handleDBCall(baton, data, false /*multiple*/ , callback)
    })
  },

  _insertTestData(baton, params, callback) {
    db.insertTestData(baton, params, (data) => {
      this._handleDBCall(baton, data, true /*multiple*/ , callback)
    })
  },

  /**
   * Handles if error occurs from DB Call
   * in case of multiple, callback will be errorExists,results
   */
  _handleDBCall(baton, data, multiple, callback) {
    //the db is called from an automated source
    if (baton.err.length > 0) {
      //the error would have been set on the DB side
      if (multiple || baton.automated_task_name) {
        callback(true)
        return
      }
      //the error would have been set on the DB side
      this._generateError(baton)
      return
    }
    if (multiple) {
      callback(null, data)
      return
    }
    callback(data)
  },

  _generateCustomId(baton, numberOfIds, length, getFunc, attr, callback) {
    baton.addMethod('_generateCustomId');

    var generateIds = (alreadyCreatedIds, callback) => {
      var potentialIds = alreadyCreatedIds
      while (potentialIds.length < numberOfIds) {
        var potentialIdToAdd = this._generateId(length);
        if (!potentialIds.includes(potentialIdToAdd)) potentialIds.push(potentialIdToAdd)
      }
      callback(potentialIds)
    }

    var getFreeIds = (potentialIds, callback) => {
      var queryParams = {}
      queryParams[attr] = potentialIds
      this[getFunc](baton, queryParams, (resulting_data) => {
        callback(potentialIds.filter(potId => !resulting_data.map(rd => rd[attr]).includes(potId)))
      })
    }

    var ids = []
    while (ids.length <= numberOfIds) {
      if (ids.length === numberOfIds) {
        callback(ids)
        return
      }
      generateIds(ids, (gen_id) => {
        getFreeIds(gen_id, freeIds => {
          ids = freeIds
        })
      })
    }
  },
  _generateId(length) {
    return parseInt(Math.random().toString().slice(2, (2 + length)))
  },
  _generateError(baton, errorCode) {
    logger.error(baton.printable())
    baton.sendError({
      'id': baton.id,
      'error_message': baton.err.map(function(err) {
        return err.public_message
      }).join('.')
    }, errorCode);
  },
  _onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
  }


}