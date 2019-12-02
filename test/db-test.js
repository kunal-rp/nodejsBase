var assert = require('assert');
const expect = require('chai').expect;
var sinon = require('sinon')

var dbActions = require('../prod2/database_actions')
var cred = require('../prod2/credentials')

/*
	Testing the sql queries that are created
*/

describe('db tests', () => {

	var sandbox;

	var sqlQuery;
	var sqlValues;

	var fakeBaton;
	var FAKE_START_TIME = 200;

	function jsonToArray(table, values) {
		var values_array = []
		values.forEach(function(value) {
			var single = []
			Object.keys(dbActions.SCHEME[table]).forEach(function(attr) {
				single.push(value[attr])
			})
			values_array.push(single)
		})
		return values_array
	}

	function jsonToUpdateValuesOrCondition(values) {
		var result = Object.keys(values).map(attr => attr + '=' + (typeof values[attr] == 'string' ? "'" + values[attr] + "'" : values[attr]))
		if (Object.keys(values).length === 1) return result[0]
		return result.join(',')
	}


	beforeEach(() => {
		cred.overridePools()

		sqlQuery = null;
		sandbox = sinon.createSandbox()

		fakeBaton = {
			methods: [],
			err: [],
			start_time: FAKE_START_TIME,
			db_limit: {},
			addMethod: function(method) {
				this.methods.push(method)
			},
			setError(err) {
				this.err.push(err)
			}
		}


		sandbox.stub(dbActions, "_makequery").callsFake((sql, values, table, baton, callback) => {
			sqlQuery = sql
			sqlValues = values
			callback([])
		})

	})

	afterEach(function() {
		sandbox.restore()
		cred.resetPools()
	})


	describe('query construction', function() {

		var originalscheme = dbActions.DB_SCHEME
		beforeEach(function() {

			dbActions.setScheme({
				'test_table': {
					'test_attr1': {
						'type': 'number'
					},
					'test_attr2': {
						'type': 'number',
						'optional': true
					},
					'test_attr3': {
						'type': 'string',
						'optional': true
					}
				},
			})
		})

		afterEach(function() {
			dbActions.resetScheme()
		})

		describe('select query', function() {
			it('should make select call', () => {
				var queryParams = {
					test_attr1: [1, 2]
				}
				dbActions._selectQuery(fakeBaton, 'test_table', queryParams, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table` WHERE test_attr1 = 1 OR test_attr1 = 2')
				})
			})

			it('should add limit query if set in baton', () => {
				fakeBaton.db_limit.test_table = {
					offset: 2,
					order_attr : 'test_attr1'
				}
				dbActions._selectQuery(fakeBaton, 'test_table', {}, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table`ORDER BY test_attr1 DESC LIMIT 100 OFFSET 100')
				})
			})

			it('should add limit query if set in baton, where offset is 1', () => {
				fakeBaton.db_limit.test_table = {
					offset: 1,
					order_attr : 'test_attr2'
				}
				dbActions._selectQuery(fakeBaton, 'test_table', {}, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table`ORDER BY test_attr2 DESC LIMIT 100 OFFSET 0')
				})
			})

			it('should create less than and greater that conditions', () => {
				var queryParams = {
					lessThan: {
						test_attr1: 101
					},
					greaterThan: {
						test_attr1: 10
					}
				}
				dbActions._selectQuery(fakeBaton, 'test_table', queryParams, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table` WHERE test_attr1 < 101 AND test_attr1 > 10')
				})
			})


			it('should create less than and greater that conditions with normal = conditions', () => {
				var queryParams = {
					test_attr3: ['text1', 'text2'],
					lessThan: {
						test_attr1: 101
					},
					greaterThan: {
						test_attr1: 10
					}
				}
				dbActions._selectQuery(fakeBaton, 'test_table', queryParams, function() {
					expect(sqlQuery.trim()).to.deep.equal('SELECT * FROM `test_table` WHERE test_attr3 = \'text1\' OR test_attr3 = \'text2\'  AND test_attr1 < 101 AND test_attr1 > 10')
				})
			})



		})

		describe('insert query', function() {
			it('should make insert multi call', () => {
				var values = [{
					test_attr1: 101,
					test_attr2: 101
				}, {
					test_attr1: 103
				}, {
					test_attr1: 102,
					test_attr2: 102
				}]
				dbActions._insertMultipleQuery('test_table', values, fakeBaton, function() {
					expect(sqlValues).to.deep.equal([
						[
							[101, 101, null],
							[103, null, null],
							[102, 102, null]
						]
					])
				})
			})

			it('should throw error for non optional field', () => {
				var values = {
					test_attr2: 101
				}
				dbActions._insertMultipleQuery('test_table', [values], fakeBaton, function() {
					expect(fakeBaton.err[0].details).to.equal('DB Actions: non-optional value not present')
				})
			})

			it('should throw error for invalid type field', () => {
				var values = [{
					test_attr2: 101,
					test_attr1: 1
				}, {
					test_attr2: 101,
					test_attr1: 'test'
				}]
				dbActions._insertMultipleQuery('test_table', values, fakeBaton, function() {
					expect(fakeBaton.err[0].details).to.equal('DB Actions: type of value not valid')
				})
			})
		})

	})

	describe('update query', () => {

		var originalscheme = dbActions.DB_SCHEME
		beforeEach(function() {

			dbActions.setScheme({
				'test_table': {
					'test_attr1': {
						'type': 'number'
					},
					'test_attr2': {
						'type': 'number',
					},
					'test_attr3': {
						'type': 'string'
					}
				},
			})
		})



		afterEach(function() {
			dbActions.resetScheme()
		})

		it('should make mass update query', (done) => {
			var condition_attr = 'test_attr1'
			var values = [{
				test_attr1: 101,
				test_attr3: "InTest 1 String Mass Update"
			}, {
				test_attr1: 201,
				test_attr3: "InTest 2 String Mass Update"
			}]

			dbActions._massUpdate(fakeBaton, 'test_table', values, condition_attr, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE test_table set test_attr3=CASE WHEN test_attr1=101 THEN \'InTest 1 String Mass Update\' WHEN test_attr1=201 THEN \'InTest 2 String Mass Update\' ELSE test_attr3 END WHERE test_attr1 IN (101,201)')
				done()
			})
		})


		it('should make update query', (done) => {
			var values = {
				test_attr3: 'intest_value',
				test_attr2: 101,
			}
			var conditions = {
				test_attr1: 300
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE `test_table` SET ' + jsonToUpdateValuesOrCondition(values) + ' WHERE ' + jsonToUpdateValuesOrCondition(conditions))
				done()
			})
		})

		it('should make update query with string conditional', (done) => {
			var values = {
				test_attr1: 300,
				test_attr2: 101,
			}
			var conditions = {
				test_attr3: 'intest_value'
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(sqlQuery.trim()).to.equal('UPDATE `test_table` SET ' + jsonToUpdateValuesOrCondition(values) + ' WHERE ' + jsonToUpdateValuesOrCondition(conditions))
				done()
			})
		})

		it('should throw for invalid param type', (done) => {
			var values = {
				test_attr3: 101, //should be string
				test_attr2: 101,
			}
			var conditions = {
				test_attr1: 300
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(fakeBaton.err[0].details).to.equal('DB Actions: type of value not valid')
				done()
			})
		})

		it('should throw for more than one condition', (done) => {
			var values = {
				test_attr3: 'InTest string',
			}
			var conditions = {
				test_attr1: 300,
				test_attr2: 101
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(fakeBaton.err[0].details).to.equal('DB Actions: only one condition is allowed for update query')
				done()
			})
		})

		it('should throw for invalid attr', (done) => {
			var values = {
				test_attr3: 'InTest string',
				test_attr2: 101,
				invalid_attr: '101'
			}
			var conditions = {
				test_attr1: 300,
			}

			dbActions._updateQuery(fakeBaton, 'test_table', values, conditions, () => {
				expect(fakeBaton.err[0].details).to.equal('DB Actions: invalid attr for table')
				done()
			})
		})
	})

	describe('roles and actions', function() {
		it('get all role data', () => {

			dbActions.getAllRoleData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `role`');
			})
		})

		it('get all action data', () => {

			dbActions.getAllActionData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `action`');
			})
		})
		it('get all role and action data', () => {

			dbActions.getAllRoleActionData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `role_action`');
			})
		})
	})

	describe('series', function() {
		it('get all test data', () => {

			dbActions.getTestData(fakeBaton, null, () => {
				expect(sqlQuery).to.equal('SELECT * FROM `testData`');
			})
		})

		it('insert new testData', () => {

			var values = {
				id: 101,
				text: 'InTest Text'
			}

			dbActions.insertTestData(fakeBaton, values, () => {
				expect(sqlQuery).to.equal('INSERT INTO `testData` (id,text) VALUES ?');
				expect(sqlValues).to.deep.equal([jsonToArray('testData', [values])])
			})
		})
	})

	

})