var db = require('./database_actions.js')
var actions = require('./actions.js')
var paramValidator = require('./param_validator')

var passwordValidator = require('password-validator');
var bcrypt = require('bcrypt')
var jwt = require('jsonwebtoken')
var fs = require('fs')
var AccessControl = require('accesscontrol')

// PRIVATE and PUBLIC key
var privateKEY = fs.readFileSync(__dirname + '/jwt_private.key', 'utf8');
var publicKEY = fs.readFileSync(__dirname + '/jwt_public.key', 'utf8');

//Schema for password validation
var PASS_SCHEMA = new passwordValidator();

// Access Control Validator
var ac = new AccessControl();
var ROLE_DATA;

var authErrorCode = 401;

PASS_SCHEMA
	.is().min(8) // Minimum length 8
	.is().max(100) // Maximum length 100
	.has().uppercase() // Must have uppercase letters
	.has().lowercase() // Must have lowercase letters
	.has().digits() // Must have digits
	.has().not().spaces() // Should not have spaces
	.is().not().oneOf(['Passw0rd', 'Password123']);

var saltCount = 5;

/**
Auth Validation for Requests 

Pre api requests, login must get called
	Will check username and password
	Create and store auth token
	Pass back token 

For all api requests
	Will check username and auth token
	IF good:
		proceed with api call
	bad:
		reject call with auth error, user will need to login again
		(future; keep counter of tries, block login for account if exceed)

*/

module.exports = {

	createUser(baton, req) {

		var createParams = (callback) => {
			callback({
				username: req.get('username'),
				email: req.get('email'),
				password: req.get('password')
			})
		}

		var validateRequest = (params, callback) => {
			paramValidator.validateRequest(baton, params, 'createUser', (update_params) => {
				if (!this._validateEmail(update_params.email)) {
					baton.setError({
						params: update_params,
						email: params.email,
						public_message: 'Invalid Email Format'
					})
					actions._generateError(baton)
					return
				}
				callback(update_params)
			})
		}

		var validateParams = (params, callback) => {
			this._getUserData(baton, params, (userData) => {
				if (userData.find(user => {
						return user.username == params.username
					}) !== undefined) {
					baton.setError({
						params: params,
						username: params.username,
						public_message: 'Username Taken'
					})
					actions._generateError(baton)
					return
				}
				if (userData.find(user => {
						return user.email == params.email
					}) !== undefined) {
					baton.setError({
						params: params,
						username: params.username,
						public_message: 'Email Already Registered'
					})
					actions._generateError(baton)
					return
				}
				var passValidation = PASS_SCHEMA.validate(params.password, {
					list: true
				})
				if (passValidation.length !== 0) {
					baton.setError({
						params: params,
						details: passValidation.toString(),
						public_message: 'Invalid Password,Please fuitfil requirements'
					})
					actions._generateError(baton)
					return
				}
				callback()
			})
		}

		var createUserWithParams = (params, callback) => {
			//salt and hash password
			bcrypt.hash(params.password, saltCount, (err, hash) => {
				if (err) {
					baton.setError({
						params: params,
						err: err
					})
					actions._generateError(baton)
					return
				}
				params.password = hash
				this._getUserData(baton, {}, user_data => {
					params.user_id = actions._generateId(actions.ID_LENGTH.user, user_data.map(function(user) {
						return user.user_id
					}))
					db.insertUser(baton, params, _ => {
						callback()
					})
				})

			})
		}

		createParams(params => {
			validateRequest(params, (update_params) => {
				validateParams(update_params, () => {
					createUserWithParams(params, _ => {
						baton.json({
							message: 'user created'
						})
					})
				})
			})
		})

	},

	login(baton, req) {
		var createParams = (callback) => {
			callback({
				username: req.get('username'),
				email: req.get('email'),
				password: req.get('password')
			})
		}

		var validateRequest = (params, callback) => {
			paramValidator.validateRequest(baton, params, 'login', (update_params) => {
				if (params.username == undefined && params.email == undefined) {
					baton.setError({
						params: update_params,
						public_message: 'Username/Email Required'
					})
					actions._generateError(baton)
					return
				}
				callback(update_params)
			})
		}

		var validateParams = (params, callback) => {

			var validateUsernameEmail = (callback) => {
				this._getUserData(baton, params, (userData) => {
					if (params.username !== undefined) {
						var user = userData.find(user => {
							return user.username == params.username
						})
						if (user === undefined) {
							baton.setError({
								params: params,
								username: params.username,
								public_message: 'Invalid Username'
							})
							actions._generateError(baton)
							return
						} else {
							callback(user)
						}
					} else {
						if (!this._validateEmail(params.email)) {
							baton.setError({
								email: params.email,
								public_message: 'Invalid Email Format'
							})
							actions._generateError(baton)
							return
						}
						var user = userData.find(user => {
							return user.email == params.email
						})
						if (user === undefined) {
							baton.setError({
								params: params,
								username: params.username,
								public_message: 'Invalid Email'
							})
							actions._generateError(baton)
							return
						} else {
							callback(user)
						}
					}
				})
			}

			var validatePassword = (user, callback) => {
				bcrypt.compare(params.password, user.password, function(err, res) {
					if (res === false) {
						baton.setError({
							params: params,
							username: params.username,
							public_message: 'Invalid Password'
						})
						actions._generateError(baton)
						return
					}
					callback()
				});
			}

			validateUsernameEmail((user) => {
				validatePassword(user, _ => {
					callback(user)
				})
			})
		}
		createParams(params => {
			validateRequest(params, (update_params) => {
				validateParams(update_params, (user) => {
					this._createJwt(user, token => {
						baton.json({
							auth_token: token
						})
					})
				})
			})
		})

	},

	_createJwt(user, callback) {
		// SIGNING OPTIONS
		var signOptions = {
			issuer: 'SceneStamp',
			subject: 'us@scenestamp.com',
			audience: user.username,
			expiresIn: "12h",
			algorithm: "RS256"
		};

		callback(jwt.sign({
			user_id: user.user_id,
			user_role: user.role
		}, privateKEY, signOptions))
	},



	_validateEmail(email) {
		var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
		return re.test(String(email).toLowerCase());
	},

	/*
	in the case where multiple servers are used, this acts as the auth endpoint called by said servers for authenication
	i.e. - there is a external server X, that will have endpoint A
	client calls X -> 
	X calls this server on validate endpoint, with query param action:A -> 
	this server responds; if suc, server carrys on; if not, server displays passed error message
	*/
	get_authValidate(baton, req) {
		baton.endpoint = req.query.action
		this.authValidate(baton, req, () => {
			baton.json({auth_validated : true})
		})
	},

	authValidate(baton, req, suc_callback) {
		baton.addMethod('authValidate')

		var createParams = (callback) => {
			callback({
				auth_token: req.get('auth_token'),
				test_mode: req.get('test_mode')
			})
		}

		var validateAuthtoken = (params, callback) => {
			//for test mode, bypass validation
			if (params.test_mode) callback()
			else {
				var token = jwt.verify(params.auth_token, publicKEY, function(err, decoded) {
					if (err || decoded === undefined) {
						baton.setError({
							err:err,
							auth_token: params.auth_token,
							public_message: 'Auth token invalid'
						})
						actions._generateError(baton,authErrorCode)
						return
					} else {
						baton.user_id = decoded.user_id
						callback(decoded.user_role)
					}
				})
			}
		}

		createParams((params) => {
			validateAuthtoken(params, (role_id) => {
				this._validateRole(baton, params, role_id, function() {
					suc_callback();
				})
			})
		})

	},

	_validateRole(baton, params, role_id, callback) {

		baton.addMethod('_validateRole')
		//for test mode, bypass validation
		if (params.test_mode){
			callback()
			return 
		}
		var checkPermission = (role_name, callback) => {
			if (!ac.can(role_name).readAny(baton.endpoint).granted) {
				baton.setError({
					role_name: role_name,
					action: baton.endpoint,
					public_message: 'Permission Denied'
				})
				actions._generateError(baton)
				return
			}
			callback()
		}

		var validateRoleData = (callback) => {
			this.getAccessControl(baton, callback)
		}

		validateRoleData(() => {

			var matchingRole = ROLE_DATA.filter(role => {
				return role.role_id == role_id
			})
			if (role_id == null) {
				baton.setError({
					details: "User not assigned a role ",
					public_message: 'Permission Denied'
				})
				actions._generateError(baton)
			} else if (matchingRole.length !== 1) {
				baton.setError({
					role_id: role_id,
					details: "Invalid Role; user set to non existant role",
					public_message: 'Permission Denied'
				})
				actions._generateError(baton)
			} else {
				checkPermission(matchingRole[0].role_name, callback)
			}
		})
	},
	_getUserData(baton, params, callback) {
		db.getUserData(baton, params, (userData) => {
			actions._handleDBCall(baton, userData, false /*multiple*/ , callback)
		})
	},


	getAccessControl(baton, callback) {
		baton.addMethod('getAccessControl')
		ac = new AccessControl();
		this._getAllRoleActionData(baton, (roleData, actionData, roleActionData) => {
			ROLE_DATA = roleData
			roleData.forEach(role => {
				var actionsWithSameRole = roleActionData.filter(rta => {
					return rta.role_id === role.role_id
				}).map(rta => {
					return rta.action_id
				})
				var validActions = actionData.filter(action => {
					return actionsWithSameRole.includes(action.action_id)
				})
				validActions.forEach(action => {
					ac.grant(role.role_name).readAny(action.action_name)
				})
			})
			callback()

		})
	},


	_getAllRoleActionData(baton, callback) {
		this._dbCall(baton, 'getAllRoleData', null, (roleData) => {
			this._dbCall(baton, 'getAllActionData', null, (actionData) => {
				this._dbCall(baton, 'getAllRoleActionData', null, (roleActionData) => {
					callback(roleData, actionData, roleActionData)
				})
			})
		})
	},
	_dbCall(baton, action, params, callback) {
		db[action](baton, params, (data) => {
			actions._handleDBCall(baton, data, false /*multiple*/ , callback)
		})
	}
}