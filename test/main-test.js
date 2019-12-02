var assert = require('assert');
const expect = require('chai').expect;
var sinon = require('sinon')
var chai = require('chai')
var chaiHttp = require('chai-http');
var nock = require('nock')
var bcrypt = require('bcrypt')
var jwt = require('jsonwebtoken')
var AccessControl = require('accesscontrol')
var winston = require('winston')
var moment = require('moment')

var server = require('../index').server

chai.use(chaiHttp);

var batonHandler = require('../prod2/baton')
var actions = require('../prod2/actions')
var auth = require('../prod2/auth')
var dbActions = require('../prod2/database_actions')
var cred = require('../prod2/credentials')
var endpointRequestParams = require('../prod2/endpointRequestParams')
var paramValidator = require('../prod2/param_validator')


var TIMEOUT = 100;


//asserts error in http request and error message
function assertErrorMessage(res, msg, custom, expectedErrorCode) {
	expect((custom == true ? res.endStatus : res.status)).to.equal((expectedErrorCode ? expectedErrorCode : 500))
	expect((custom == true ? res.data : res.body)).to.have.property('error_message')
	expect((custom == true ? res.data : res.body).error_message).to.equal(msg)
}

//assert http sucsess
function assertSuccess(res, post) {
	expect(res.status).to.equal((post ? 201 : 200))
}

describe('main server tests', function() {

	//sends http request to server
	function sendRequest(path, params, post, headers) {

		var addHeaders = req => {
			if (headers !== undefined) {
				Object.keys(headers).forEach(head => {
					req.set(head, headers[head])
				})
			}
			return req
		}

		return (post ?
			addHeaders(chai.request(server).post('/' + path).set('content-type', 'application/json')).send(params) :
			addHeaders(chai.request(server).get('/' + path + '?' + Object.keys(params).map(attr => {
				return attr + '=' + params[attr]
			}).join('&'))).send())

	}


	var sandbox;

	//globally set to access is ubiquitous accross all tests
	var fakeReq;
	var fakeRes;
	var fakeBaton;
	var idsForGeneration;
	//for after the http request is done, callbacks will contain assertions in test
	//called by baton's res json
	var afterReq = () => {}


	//fake data for db calls
	var fake_db_testData;
	var fake_db_userData;

	//fake data from external http calls
	var fake_ext_testData;

	//set up global vars/ test data

	beforeEach(function() {

		sandbox = sinon.createSandbox()

		idsForGeneration = [10, 11, 12, 13, 14, 15];

		fakeRes = {
			data: null,
			endStatus: null,
			status: function(endStatus) {
				this.endStatus = endStatus
				return this
			},
			json: function(data) {
				this.data = data;
			}
		}

		//req body to test the auth 
		//can't use the chai http , since we are not makking a endpoint call and simple calling a function 
		fakeReq = {
			headers: {},
			body: {},
			get(attr) {
				return this.headers[attr]
			}
		}

		fake_db_testData = [{
			id: 1,
			text: 'test db 1'
		}, {
			id: 2,
			text: 'test db 2'
		}]

		fake_db_userData = [{
			user_id: 101,
			username: 'user_1',
			password: 'pass_1',
			email: 'email1@email.com'
		}, {
			user_id: 102,
			username: 'user_2',
			password: 'pass_2',
			email: 'email2@email.com'
		}];

		//default stubs for all tests 

		//baton 
		//set baton to global var for access
		sandbox.stub(batonHandler, 'createBaton').callsFake(function(endpoint, params, res) {
			var baton = batonHandler.createBaton.wrappedMethod.apply(this, arguments)
			fakeBaton = baton;
			return baton
		})

		//auth validation
		//by default, all auth is bypassed for testing purposes
		//in segmented tests, this is reverted in the beforeEach of the test
		sandbox.stub(auth, 'authValidate').callsFake(function(baton, req, callback) {
			callback()
		})

		sandbox.stub(actions, '_generateId').callsFake(function() {
			return idsForGeneration.shift()
		})
	});

	afterEach(function() {
		sandbox.restore()
		nock.cleanAll()
	})

	describe('authentication tests', () => {
		//both jwt-auth-for-req and login

		describe('authentication', () => {

			//stub the role and action data/links from db
			var fakeRoleData = [{
				role_id: 0,
				role_name: 'Admin',
			}, {
				role_id: 1,
				role_name: 'Other',

			}]

			var fakeActionData = [{
				action_id: 101,
				action_name: 'authActionTest'
			}]

			var fakeRoleActionData = [{
				role_id: 0,
				action_id: 101
			}, {
				role_id: 0,
				action_id: 102
			}, {
				role_id: 1,
				action_id: 101
			}]

			//for auth verification where the jwt is passed in req header
			function authVerify() {
				sandbox.stub(jwt, 'verify').callsFake(function(token, key, callback) {
					callback(null, JSON.parse(token))
				})
			}

			function authVerifyFail() {
				sandbox.stub(jwt, 'verify').callsFake(function(token, key, callback) {
					callback(null, undefined)
				})
			}

			beforeEach(function() {
				auth.authValidate.restore()

				sandbox.stub(dbActions, 'getAllRoleData').callsFake(function(baton, queryData, callback) {
					callback(fakeRoleData)
				})

				sandbox.stub(dbActions, 'getAllActionData').callsFake(function(baton, queryData, callback) {
					callback(fakeActionData)
				})

				sandbox.stub(dbActions, 'getAllRoleActionData').callsFake(function(baton, queryData, callback) {
					callback(fakeRoleActionData)
				})
			})

			describe('general req authentication', function() {

				var createBatonForTest = () => {
					fakeBaton = batonHandler.createBaton( /*correlation_id*/ 10, 'authActionTest', fakeReq.body, fakeRes)
				}

				it('should validate auth token', function(done) {
					fakeReq.headers = {
						auth_token: JSON.stringify({
							user_id: 101,
							user_role: 0
						})
					}
					authVerify();
					createBatonForTest();
					auth.authValidate(fakeBaton, fakeReq, function() {
						expect(fakeBaton.user_id).to.equal(101)
						done()
					})
				})

				it('should not validate with test mode', function(done) {
					fakeReq.headers = {
						auth_token: {
							user_id: 101,
							user_role: 0
						},
						test_mode: true
					}
					authVerify();
					createBatonForTest();
					auth.authValidate(fakeBaton, fakeReq, function() {
						expect(fakeBaton.user_id).to.equal(null)
						done()
					})
				})

				it('should throw for invalid auth token', (done) => {

					fakeReq.headers = {
						auth_token: 'test',
						user_role: 0
					}
					authVerifyFail();
					createBatonForTest();
					auth.authValidate(fakeBaton, fakeReq, () => {})
					setTimeout(() => {
						expect(fakeBaton.err[0].public_message).to.equal('Auth token invalid')
						expect(fakeRes.endStatus).to.equal(401);
						done()
					}, TIMEOUT)
				})
			})

			describe('validate endpoint', function() {

				it('should validate user for endpoint-', (done) => {

					var headers = {
						auth_token: JSON.stringify({
							user_id: 101,
							user_role: 0
						}),
						test_mode: true
					}
					authVerify();

					sendRequest('validate', {
						action: 'authActionTest'
					}, /*post=*/ false, headers).end((err, res, body) => {
						assertSuccess(res)
						done()
					})
				})

				it('should throw error for invalid jwt', (done) => {

					var headers = {
						auth_token: JSON.stringify({
							user_id: 101,
							user_role: 0
						})
					}
					authVerifyFail();

					sendRequest('validate', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Auth token invalid', /*custom=*/ false, 401)
						done()
					})
				})

				it('should throw error for invalid action', (done) => {

					var headers = {
						auth_token: JSON.stringify({
							user_id: 101,
							user_role: 0
						})
					}
					authVerify();

					//authActionTest2 is NOT a valid action
					sendRequest('validate', {
						action: 'authActionTest2'
					}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Permission Denied', /*custom=*/ false, 500)
						done()
					})
				})

			})

		})

		describe('user creation/login ', () => {

			var hashedPassword = 'hashedPassword'

			//for login requests
			function sucsPassCompare() {
				sandbox.stub(bcrypt, 'compare').callsFake(function(pass, saved, callback) {
					callback(null, true)
				})
			}

			function failPassCompare() {
				sandbox.stub(bcrypt, 'compare').callsFake(function(pass, saved, callback) {
					callback(null, false)
				})
			}

			beforeEach(function() {

				//stub get all series data for all tests
				sandbox.stub(dbActions, 'getUserData').callsFake(function(baton, data, callback) {
					return callback(fake_db_userData.filter(user => {
						return user.username == data.username || user.email == data.email
					}))
				})

				sandbox.stub(bcrypt, 'hash').callsFake(function(pass, salt, callback) {
					callback(null, hashedPassword)
				})

				sandbox.stub(dbActions, 'insertUser').callsFake(function(baton, newUser, callback) {
					fake_db_userData.push(newUser)
					callback()
				})

				sandbox.stub(jwt, 'sign').callsFake(function(payload, privateKey, signingOptions) {
					return {
						payload: payload,
						privateKey: privateKey,
						signingOptions: signingOptions
					}
				})

			})

			describe('create user', function() {

				it('should create user', function(done) {
					var headers = {
						username: 'testUserName',
						email: 'testemail@email.com',
						password: 'testPassword1'
					}
					sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertSuccess(res)
						headers.password = hashedPassword
						headers.user_id = 11
						expect(fake_db_userData[fake_db_userData.length - 1]).to.deep.equal(headers)
						done()
					})
				})

				it('should throw parameter validation for missing params', function(done) {
					var headers = {
						//missing username
						email: 'testemail@email.com',
						password: 'testPassword1'
					}
					sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Parameter validation error')
						done()
					})
				})

				it('should throw for invalid email format', function(done) {
					var headers = {
						username: 'testUserName',
						email: 'testemail', //invalid email format
						password: 'testPassword1'
					}
					sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Email Format')
						done()
					})
				})

				it('should throw for invalid password validation', function(done) {
					var headers = {
						username: 'testUserName',
						email: 'testemail@email.com',
						password: 'pass' //invalid password 
					}
					sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Password,Please fuitfil requirements')
						done()
					})
				})

				it('should throw for existing account with email', function(done) {
					var headers = {
						username: 'testUserName',
						email: fake_db_userData[0].email, //existing email
						password: 'testPassword1'
					}
					sendRequest('createUser', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Email Already Registered')
						done()
					})
				})

			})

			describe('login', function() {

				it('should login user with username', function(done) {
					var user = fake_db_userData[0]
					var headers = {
						username: user.username,
						password: user.password
					}
					sucsPassCompare();
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertSuccess(res)
						expect(res.body.auth_token.payload).to.deep.equal({
							user_id: user.user_id
						})
						done()
					})
				})


				it('should login user with email', function(done) {
					var user = fake_db_userData[0]
					var headers = {
						email: user.email,
						password: user.password
					}
					sucsPassCompare();
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertSuccess(res)
						expect(res.body.auth_token.payload).to.deep.equal({
							user_id: user.user_id
						})
						done()
					})
				})

				it('should login user and set user role', function(done) {
					fake_db_userData[0].role = 101
					var user = fake_db_userData[0]
					var headers = {
						email: user.email,
						password: user.password
					}
					sucsPassCompare();
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertSuccess(res)
						expect(res.body.auth_token.payload).to.deep.equal({
							user_id: user.user_id,
							user_role: user.role
						})
						done()
					})
				})

				it('should throw for invalid username', function(done) {
					var user = fake_db_userData[0]
					var headers = {
						username: 'invalidUsername',
						password: user.password
					}
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Username')
						done()
					})
				})

				it('should throw for invalid email format', function(done) {
					var user = fake_db_userData[0]
					var headers = {
						email: 'invalidEmail',
						password: user.password
					}
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Email Format')
						done()
					})
				})

				it('should throw for invalid email format', function(done) {
					var user = fake_db_userData[0]
					var headers = {
						email: 'invalidEmail@test.com',
						password: user.password
					}
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Email')
						done()
					})
				})

				it('should throw for invalid password', function(done) {
					var user = fake_db_userData[0]
					var headers = {
						username: user.username,
						password: user.password
					}
					failPassCompare();
					sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
						assertErrorMessage(res, 'Invalid Password')
						done()
					})
				})
			})

		})


	})

	describe('request validation tests', function() {

		var fakeBaton;

		beforeEach(() => {
			paramValidator.setActionValidation({
				testAction: {
					attr_1: {
						type: "number"
					},
					attr_2: {
						type: "boolean",
						optional: true
					},
					attr_3: {
						type: "number",
						multiple: true
					},
					attr_4: {
						type: "intest_custom_obj_1",
						optional: true
					},
					attr_5: {
						type: "intest_custom_obj_2",
						optional: true
					}
				}
			})

			endpointRequestParams.setCustomObjects({
				intest_custom_obj_1: {
					custom_obj_attr_1: 'number',
				},
				intest_custom_obj_2: {
					custom_obj_attr_2: 'array'
				}
			})
		})

		afterEach(() => {
			paramValidator.resetActionValidation()
			endpointRequestParams.resetCustomObjects();
		})

		function createFakeBaton(params, post) {
			var baton = batonHandler.createBaton( /*correlation_id*/ 10, 'testAction', params, fakeRes)
			if (post) baton.requestType = 'POST'
			fakeRes = baton.res
			return baton
		}

		it('should validate request params', function(done) {
			var params = {
				attr_1: "101",
				attr_3: "101, 102"
			}
			paramValidator.validateRequest(createFakeBaton(params), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				done()
			})
		})

		it('should vaildate request params for post request', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102]
			}
			paramValidator.validateRequest(createFakeBaton(params, /*post=*/ true), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				done()
			})
		})

		it('should vaildate request params for post request with custom obj', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_4: {
					custom_obj_attr_1: 1
				}
			}
			paramValidator.validateRequest(createFakeBaton(params, /*post=*/ true), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				expect(updated_params.attr_4).to.deep.equal({
					custom_obj_attr_1: 1
				})
				done()
			})
		})

		it('should vaildate request params for post request with custom obj with array', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_5: {
					custom_obj_attr_2: [1, 2, 3]
				}
			}
			paramValidator.validateRequest(createFakeBaton(params, /*post=*/ true), params, 'testAction', updated_params => {
				expect(updated_params.attr_1).to.equal(101)
				expect(updated_params.attr_3).to.deep.equal([101, 102])
				expect(updated_params.attr_5).to.deep.equal({
					custom_obj_attr_2: [1, 2, 3]
				})
				done()
			})
		})

		it('should throw non optional error', (done) => {
			var params = {
				attr_2: 'true',
				attr_3: "101, 102"
			}
			var fakeBaton = createFakeBaton(params)
			paramValidator.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Attibute value missing')
				done()
			}, TIMEOUT)
		})

		it('should throw non multiple error', (done) => {
			var params = {
				attr_1: "101, 102",
				attr_3: "101,102"
			}
			var fakeBaton = createFakeBaton(params)
			paramValidator.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Single Value is Expected')
				done()
			}, TIMEOUT)
		})

		it('should throw invalid attribute type', (done) => {
			var params = {
				attr_1: "101",
				attr_2: '101',
				attr_3: "101,102"
			}
			var fakeBaton = createFakeBaton(params)
			paramValidator.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

		it('should throw invalid attribute type for post request', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 'a102'] //102 invalid type
			}
			var fakeBaton = createFakeBaton(params, /*post=*/ true)
			paramValidator.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

		it('should throw invalid attribute type for post request custom object', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_5: {
					custom_obj_attr_2: 101 //invalid, expecting an array 
				}
			}
			var fakeBaton = createFakeBaton(params, /*post=*/ true)
			paramValidator.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

		it('should throw for invalid value in post req custom object array', (done) => {
			var params = {
				attr_1: 101,
				attr_3: [101, 102],
				attr_5: {
					custom_obj_attr_2: [1, 2, 'a'] //invalid a 
				}
			}
			var fakeBaton = createFakeBaton(params, /*post=*/ true)
			paramValidator.validateRequest(fakeBaton, params, 'testAction')
			setTimeout(function() {
				assertErrorMessage(fakeRes, 'Parameter validation error', /*custom=*/ true)
				expect(fakeBaton.err[0].error_detail).to.equal('Invalid Attribute Type')
				done()
			}, TIMEOUT)
		})

	})

	describe('testGetCall', function() {

		beforeEach(function() {
			//use sandbox.stub to stub all related db responses

			sandbox.stub(dbActions, 'getTestData').callsFake(function(baton, params, callback) {
				callback(fake_db_testData.filter(td => (params && params.id ? params.id.includes(td.id) : true)))
			})
		})

		it('should return a response', function(done) {
			sendRequest('testGetCall', {}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.msg).to.equal('testGetCall good')
				expect(res.body.param).to.equal(false)
				expect(res.body.data_details).to.equal(fake_db_testData.length)
				done()
			})
		})

		it('should set param if param passed', function(done) {
			sendRequest('testGetCall', {
				test_param: 'some tex'
			}).end((err, res, body) => {
				assertSuccess(res)
				expect(res.body.param).to.deep.equal(true)
				done()
			})

		})
	})

	describe('testPostCall', function() {

		beforeEach(function() {
			//use sandbox.stub to stub all related db responses

			sandbox.stub(dbActions, 'insertTestData').callsFake(function(baton, values, callback) {
				fake_db_testData = fake_db_testData.concat(values)
				callback(values)
			})

			sandbox.stub(dbActions, 'getTestData').callsFake(function(baton, params, callback) {
				callback(fake_db_testData.filter(td => (params && params.id ? params.id.includes(td.id) : true)))
			})

		})

		it('should return a response', function(done) {
			var sampleText = "InTest Text"
			sendRequest('testPostCall', {
				text: sampleText
			}, /*post=*/ true).end((err, res, body) => {
				assertSuccess(res, /*post=*/ true)
				expect(res.body.msg).to.deep.equal('testPostCall good')
				var addedData = fake_db_testData.find(fd => fd.id === 11)
				expect(addedData.text).to.equal(sampleText)
				done()
			})

		})

		it('should throw for invalid text', function(done) {
			var sampleText = 101
			sendRequest('testPostCall', {
				text: sampleText
			}, /*post=*/ true).end((err, res, body) => {
				assertErrorMessage(res, 'Parameter validation error')
				done()
			})

		})
	})

	describe('should fake data', () => {

		beforeEach(() => {
			auth.authValidate.restore()
		})

		//no fake db stub
		//testing that the fake data set in the fakeData folder is read/modified

		var loginAndGetAuthToken = (callback) => {
			var headers = {
				username: 'firstUser',
				password: 'Testing'
			}
			sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
				callback(res.body.auth_token)
			})
		}


		it('should login fake user', (done) => {
			var headers = {
				username: 'firstUser',
				password: 'Testing'
			}
			sendRequest('login', {}, /*post=*/ false, headers).end((err, res, body) => {
				assertSuccess(res)
				done()
			})
		})

		it('should validate auth token', (done) => {
			loginAndGetAuthToken((auth_token) => {
				headers = {
					auth_token: auth_token,
				}

				sendRequest('validate', {
					action: 'testGetCall'
				}, /*post=*/ false, headers).end((err2, res2, body2) => {
					assertSuccess(res2)
					expect(res2.body.auth_validated).to.equal(true)
					done()
				})
			})
		})

		it('should get fake testdata', (done) => {
			loginAndGetAuthToken((auth_token) => {
				var headers = {
					auth_token: auth_token,
				}
				sendRequest('testGetCall', {}, /*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.data_details).to.equal(1)
					done()
				})
			})
		})

		it('should post fake testdata', (done) => {
			loginAndGetAuthToken((auth_token) => {
				var headers = {
					auth_token: auth_token,
				}
				sendRequest('testGetCall', {},/*post=*/ false, headers).end((err, res, body) => {
					assertSuccess(res)
					expect(res.body.data_details).to.equal(1)
					done()
				})
			})
		})


	})

})