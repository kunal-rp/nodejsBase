var express = require('express');
const bodyParser = require('body-parser');
var cors = require('cors')

var batonHandler = require('./prod2/baton')
var actions = require('./prod2/actions')
var paramValidator = require('./prod2/param_validator')
var auth = require('./prod2/auth')

/*

Usual Setup:

Action: main logic
	handles param validation
Auth: user authentication 
Automated Tasks: reoccuring calls 

var production_action = );
var auth = require('./prod2/auth.js')
var automated_tasks = require('./prod2/automated_tasks')
*/

var app = express();
app.options('*', cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));


//all of the endpoints for the server
// GET by default, specify for POST
var endpoints = [
{
	url: 'testPostCall',
	action: 'post_testPostCall',
	post: true
}, {
	url: 'testGetCall',
	action: 'get_testGetCall'
}];

app.all('*', function(req, res, next) {
	var origin = req.get('origin');
	res.header('Access-Control-Allow-Origin', origin);
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	next();
});



endpoints.forEach(function(endpoint) {
	var endpointFunction = function(req, res) {
		//gets api params based on call type
		var params = (endpoint.post ? req.body : req.query)
		//create baton for request
		var baton = batonHandler.createBaton(actions._generateId(10), endpoint.url, params, res)
		if (endpoint.post) baton.requestType = 'POST'
		//validate user for call
		auth.authValidate(baton, req, function() {
			//validate request params
			paramValidator.validateRequest(baton, params, endpoint.url, function(updated_params) {
				//continue call and call main logic
				if (updated_params) actions[endpoint.action](baton, updated_params, res);
			})
		})
	}
	if (endpoint.post) {
		app.post('/' + endpoint.url, endpointFunction);
		return
	}
	app.get('/' + endpoint.url, endpointFunction);
})

//user specific endpoints
//seperate b/c doesn't require actions call, rather only auth calls
var user_endpoints = [{
	url: 'createUser',
	action: 'createUser'
}, {
	url: 'login',
	action: 'login'
}, {
	url: 'permission',
	action: 'permission'
}, {
	url: 'validate',
	action: 'get_authValidate'
}]

user_endpoints.forEach(function(endpoint) {

	var endpointFunction = function(req, res) {
		var baton = batonHandler.createBaton(actions._generateId(10), endpoint.url, null, res)
		auth[endpoint.action](baton, req)
	}
	app.get('/' + endpoint.url, endpointFunction);
})


var server = app.listen(process.env.PORT || 8081, function() {
	console.log("Scene Stamp Server Running @ port ", this.address().port)

	//startIntervalTasks()
})


var startIntervalTasks = () => {
	//will run all automated tasks 
	if (process.env.NODE_ENV === 'production') {
		//insert prod here 	
	}
}

module.exports = {
	server: server,
	startIntervalTasks: startIntervalTasks,
}