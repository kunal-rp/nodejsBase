var mysql = require('mysql');


var MAIN_POOLS = {
	//aws credentials

	//example pool setup
	/*pool: mysql.createPool({
		connectionLimit: 9,
		host: "database-1.cdolegs6ibeo.us-east-2.rds.amazonaws.com",
		user: "admin",
		password: "TimestampDatabase101",
		database: "ss-timestamp-2"
	}),
	user_pool: mysql.createPool({
		connectionLimit: 9,
		host: "database-1.cdolegs6ibeo.us-east-2.rds.amazonaws.com",
		user: "admin",
		password: "TimestampDatabase101",
		database: "ss-timestamp-2"
	}) */

	pool: null,
	user_pool: null
}
var VIDEO_SERVER_URL = 'http://ubuntu@ec2-18-221-3-92.us-east-2.compute.amazonaws.com'
var VIDEO_SERVER_PORT = 8081

var pools = JSON.parse(JSON.stringify(MAIN_POOLS))

//In the case elastic logging server avali, set up the elastic url here
//NOTE : will need to remove the logger from the logger.js file if elastic not setup to only console logging
var ELASTIC_SEARCH_URL = 'https://elastic:..;'



module.exports = {

	overridePools:() =>{
		pools = {user_pool : 'a', pool:'a'}

	},

	resetPools: () => {
		 pools = JSON.parse(JSON.stringify(MAIN_POOLS))
	},

	// above for testing only
	pools: () => {
		return pools
	},
	VIDEO_SERVER_URL: VIDEO_SERVER_URL,
	VIDEO_SERVER_PORT: VIDEO_SERVER_PORT,

	ELASTIC_SEARCH_URL: ELASTIC_SEARCH_URL

}