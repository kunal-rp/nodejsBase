//indicates the query/body params that are passed for each request


var MAIN_VALIDATION = {

  testGetCall:{
    test_param:{
      type:'string',
      optional:true
    }
  },

  testPostCall:{
    text:{
      type:'string'
    }
  },

  createUser: {
    username: {
      type: 'string'
    },
    email: {
      type: 'string'
    },
    password: {
      type: 'string'
    }
  },
  login: {
    username: {
      type: 'string',
      optional: true
    },
    email: {
      type: 'string',
      optional: true
    },
    password: {
      type: 'string'
    }
  },
}

var CUSTOM_OBJECTS = {

  mass_timestamp: {
    start_time: 'number',
    episode_id: 'number',
    category_ids: 'array',
    character_ids: 'array',
  },

  compilation_timestamp: {
    timestamp_id: "number",
    duration: "number",
    start_time: "number",
  }
}

module.exports = {
  MAIN_VALIDATION: MAIN_VALIDATION,
  CUSTOM_OBJECTS: CUSTOM_OBJECTS,
  setCustomObjects(obj) {
    this.CUSTOM_OBJECTS = obj
  },
  resetCustomObjects() {
    this.CUSTOM_OBJECTS = CUSTOM_OBJECTS
  }
}