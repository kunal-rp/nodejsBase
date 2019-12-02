var endpointRequestParams = require('./endpointRequestParams')
var actions = require('./actions')

var ACTION_VALIDATION = endpointRequestParams.MAIN_VALIDATION

//Validates all query and body param for given endpoint based on json file endpointRequestParams

module.exports = {


  ACTION_VALIDATION: ACTION_VALIDATION,
  setActionValidation(actionValidation) {
    ACTION_VALIDATION = actionValidation
  },
  resetActionValidation() {
    ACTION_VALIDATION = endpointRequestParams.MAIN_VALIDATION
  },
	//the above is for testing only

	_convertParams(baton, params, action, callback) {

		var throwConversionError = (attr) => {
			baton.setError({
				sub_attr: attr
			})
			callback(NaN)
		}

		function checkCustom(customObj, obj, callback) {
			var index = 0
			var updated_obj = {}
			Object.keys(customObj).every(attr => {
				if (customObj[attr] == 'array') {
					if (Array.isArray(obj[attr]) && !obj[attr].map(val => parseInt(val)).includes(NaN)) {
						index++;
						return true
					}
					return false
				} else if (customObj[attr] == typeof obj[attr]) {
					index++;
					return true
				} else {
					baton.setError({
						sub_attr: attr
					})
					return false
				}
			})
			if (index === Object.keys(customObj).length) callback(obj)
			else callback(NaN)
		}
		var update_params = {}
		var index = 0
		Object.keys(ACTION_VALIDATION[action]).every(attr => {
			if (params[attr] == null || params[attr] == undefined) update_params[attr] = null
			else {
				update_params[attr] = (baton.requestType == 'GET' ? params[attr].split(',') : (Array.isArray(params[attr]) ? params[attr] : [params[attr]])).map(arrayValue => {
					switch (ACTION_VALIDATION[action][attr].type) {
						case 'string':
							return (typeof arrayValue === 'string' ? arrayValue : NaN)
						case 'number':
							return parseInt(arrayValue)
						case 'boolean':
							if (arrayValue !== 'true' && arrayValue !== 'false') {
								return NaN
							}
							return arrayValue === 'true'
						default: //the param type is custom 
							var value;
							checkCustom(endpointRequestParams.CUSTOM_OBJECTS[ACTION_VALIDATION[action][attr].type], arrayValue, val => {
								value = val;
							})
							return value
					}
				})
			}
			index++;
			if (index === Object.keys(ACTION_VALIDATION[action]).length) {
				callback(update_params)
			} else {
				return true
			}
		})
	},

	validateRequest(baton, params, action, callback) {
		var t = this

		function throwInvalidParam(attr, error_detail, sub_attr) {
			baton.setError({
				error_detail: error_detail,
				action: action,
				attr: attr,
				sub_attr: (sub_attr ? sub_attr : undefined),
				public_message: 'Parameter validation error'
			})
			actions._generateError(baton)
		}
		if (ACTION_VALIDATION[action] !== undefined) {
			this._convertParams(baton, params, action, updated_params => {
				var index = 0
				Object.keys(ACTION_VALIDATION[action]).every(attr => {
					if (updated_params[attr] === null) {
						if (ACTION_VALIDATION[action][attr].optional !== true) {
							throwInvalidParam(attr, 'Attibute value missing')
							return false
						}
						delete updated_params[attr]
					} else {
						if (updated_params[attr].includes(NaN)) {
							var existing = {};
							if (baton.err[0]) {
								existing = baton.err[0]
								baton.err = []
							}
							throwInvalidParam(attr, 'Invalid Attribute Type', existing.sub_attr)
							return false
						} else if (ACTION_VALIDATION[action][attr].multiple !== true && updated_params[attr].length > 1) {
							throwInvalidParam(attr, 'Single Value is Expected')
							return false
						}
					}
					if (ACTION_VALIDATION[action][attr].multiple !== true && updated_params[attr] !== undefined) updated_params[attr] = updated_params[attr][0]
					index++;
					if (index === Object.keys(ACTION_VALIDATION[action]).length) {
						callback(updated_params)
					} else return true
				})
				//function goes here when something fails
				//b/c throwsInvalidParam is called, the response is given
			})
		} else {
			callback({})
		}
	},

}