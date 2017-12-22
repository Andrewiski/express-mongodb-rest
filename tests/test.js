// Richard Wen
// rrwen.dev@gmail.com


require('dotenv').config();

// (packages) Package dependencies
var express = require('express');
var fs = require('fs');
var moment = require('moment');
var api = require('../index.js');
var request = require('supertest');
var test = require('tape');
var queryParser = require('express-query-int');

const Client = require('mongodb').MongoClient;

// (test_info) Get package metadata
var json = JSON.parse(fs.readFileSync('package.json', 'utf8'));
var testedPackages = [];
for (var k in json.dependencies) {
	testedPackages.push(k + ' (' + json.dependencies[k] + ')');
}
var devPackages = [];
for (var k in json.devDependencies) {
	devPackages.push(k + ' (' + json.devDependencies[k] + ')');
}

// (test_log) Pipe tests to file and output
if (!fs.existsSync('./tests/log')){
	fs.mkdirSync('./tests/log');
}
var testFile = './tests/log/test_' + json.version.split('.').join('_') + '.txt';
test.createStream().pipe(fs.createWriteStream(testFile));
test.createStream().pipe(process.stdout);

// (test_function_mongoget) MongoDB find test function
var mongoGET = function(app, collection, query, t, actual, msg, options, log) {
	return collection.find(query, options).toArray()
		.then(docs => {
			var expected = docs;
			for (var i = 0; i < docs.length; i++) {
				if (expected[i]._id != undefined) {
					expected[i]._id = expected[i]._id.toString();
				}
			}
			if (log) {
				console.log('==> QUERY: ' , query);
				console.log('==> ACTUAL:  ', actual);
				console.log('==> EXPECTED:  ', expected);
			}
			t.deepEquals(actual, expected, msg);
		});
};

// (test_function_mongoend) MongoDB clean up function
var mongoEnd = function(db, client, t) {
	
	// (test_drop) Drop database
	return db.dropDatabase()
		.then(res => {
		
			// (test_drop_pass) Dropped database
			t.pass('(MAIN) Drop MongoDB database');
			
			// (test_drop_client) Drop client connection
			return client.close()
				.then(res => {
				
					// (test_drop_client_pass) Dropped connection
					t.pass('(MAIN) MongoDB disconnect');
					process.exit();
				})
				.catch(err => {
					
					// (test_drop_client_fail) Fail to drop connection
					t.fail('(MAIN) MongoDB disconnect: ' + err.message);
					process.exit();
				});
		})
		.catch(err => {
			
			// (test_drop_fail) Fail to drop database
			t.fail('(MAIN) Drop MongoDB database: ' + err.message);
			process.exit();
		});
};

// (test) Run tests
test('Tests for ' + json.name + ' (' + json.version + ')', t => {
	t.comment('Node.js (' + process.version + ')');
	t.comment('Description: ' + json.description);
	t.comment('Date: ' + moment().format('YYYY-MM-DD hh:mm:ss'));
	t.comment('Dependencies: ' + testedPackages.join(', '));
	t.comment('Developer: ' + devPackages.join(', '));
	process.env.MONGODB_DATABASE = process.env.MONGODB_TESTDATABASE;
	
	// (test_connect) Connect to mongodb
	Client.connect(process.env.MONGODB_CONNECTION, function(err, client) {
		var db = client.db(process.env.MONGODB_DATABASE);
		var collection = db.collection(process.env.MONGODB_COLLECTION);
		
		// (test_connect_fail) Fail to connect
		if (err) {
			t.fail('(MAIN) MongoDB connect: ' + err.message);
			mongoEnd(db, client, t);
		}
		
		// (test_insert) Insert test data
		return collection.insertMany([{a:1.00, b: 'b', c: 'a', d: -1.00}, {a: -1.00, b: 'a', c: 'b', d: 10.00}, {a: 10.00, b: 'c', c: 'b', d: 1.00}])
			.then(res => {
				
				// (test_insert_pass) Inserted data
				t.pass('(MAIN) insertMany');
				
				// (test_app) Create base app
				var baseApp = express();
				baseApp.use(queryParser());
				baseApp.use('/api', api());
				
				// (test_app_rest) Create REST app
				var restApp = express();
				options = {mongodb: {}, rest: {}};
				options.mongodb = {
					connection: process.env.MONGODB_CONNECTION,
					database: process.env.MONGODB_DATABASE,
					collection: process.env.MONGODB_COLLECTION,
					method: 'find',
					keys:  ['q', 'options'],
					callback:  function(query, result) {return result;},
					parse: function(query) {return query;}
				};
				options.rest.GET = {
					connection: process.env.MONGODB_CONNECTION,
					database: process.env.MONGODB_DATABASE,
					collection: process.env.MONGODB_COLLECTION,
					method: 'find',
					query: [{}],
					keys:  ['q', 'options'],
					callback:  function(query, result) {return result.limit(100);}
				};
				options.rest.POST = {
					method: 'insertMany',
					keys:  ['docs', 'options']
				};
				options.rest.PUT = {
					method: 'updateMany',
					keys: ['q', 'update', 'options']
				};
				options.rest.DELETE = {
					method: 'deleteMany',
					keys: ['q']
				};
				restApp.use(queryParser());
				restApp.use('/rest', api(options));
				
				// (test_app_scratch) Unused app to check options
				var scratchApi = api({
					mongodb: {
						callback: 'function(query, result) {return result;};',
						parse: 'function(query) {return query;};'
					}
				});
				
				// (test_app_return) Pass apps to thenables
				return {base: baseApp, rest: restApp};
			})
			.then(app => {
				t.comment('(A) tests on app response');
				
				// (test_base_get_200) Test base GET response 200
				return request(app.base)
					.get('/api')
					.expect(200)
					.then(res => {
						
						// (test_base_get_200_pass) Pass base GET response 200
						t.pass('(A) base app GET 200 success');
					})
					.catch(err => {
						
						// (test_base_get_200_fail) Fail base GET response 200
						t.fail('(A) base app GET 200 success: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_get_200) Test rest GET response 200
				return request(app.rest)
					.get('/rest')
					.expect(200)
					.then(res => {
						
						// (test_rest_get_200_pass) Pass rest GET response 200
						t.pass('(A) REST GET 200 success');
					})
					.catch(err => {
						
						// (test_rest_get_200_fail) Fail rest GET response 200
						t.fail('(A) REST GET 200 success: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_post_200) Test rest POST response 200
				return request(app.rest)
					.post('/rest')
					.expect(200)
					.then(res => {
						
						// (test_rest_post_200_pass) Pass rest POST response 200
						t.pass('(A) REST POST 200 success');
					})
					.catch(err => {
						
						// (test_rest_post_200_fail) Fail rest POST response 200
						t.fail('(A) REST POST 200 success: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_put_200) Test rest PUT response 200
				return request(app.rest)
					.put('/rest')
					.expect(200)
					.then(res => {
						
						// (test_rest_put_200_pass) Pass rest PUT response 200
						t.pass('(A) REST PUT 200 success');
					})
					.catch(err => {
						
						// (test_rest_put_200_fail) Fail rest PUT response 200
						t.fail('(A) REST PUT 200 success: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_delete_200) Test rest DELETE response 200
				return request(app.rest)
					.delete('/rest')
					.expect(200)
					.then(res => {
						
						// (test_rest_delete_200_pass) Pass rest DELETE response 200
						t.pass('(A) REST DELETE 200 success');
					})
					.catch(err => {
						
						// (test_rest_delete_200_fail) Fail rest DELETE response 200
						t.fail('(A) REST DELETE 200 success: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				t.comment('(B) tests on base app')
				
				// (test_base_get) Test base GET
				return request(app.base)
					.get('/api')
					.then(res => {
						
						// (test_base_get_pass) Pass base GET
						var actual = res.body;
						var expected = {};
						t.deepEquals(actual, expected, '(B) base /api GET');
					})
					.catch(err => {
						
						// (test_base_get_fail) Fail base GET
						t.fail('(B) base /api GET: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_base_get_string_query) Test base GET string query
				return request(app.base)
					.get('/api?q[c]=b&q[b]=a')
					.then(res => {
						
						// (test_base_get_string_query_pass) Pass base GET string query
						var query = {c: 'b', b: 'a'};
						var actual = res.body;
						var msg = '(B) base /api GET string query';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_base_get_string_query_fail) Fail base GET string query
						t.fail('(B) base /api GET string query: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_base_get_number_query) Test base GET number query
				return request(app.base)
					.get('/api?q[a][$gt]=1&q[d][$lt]=10')
					.then(res => {
						
						// (test_base_get_number_query_pass) Pass base GET number query
						var query = {a: {$gt: 1}, d: {$lt: 10}};
						var actual = res.body;
						var msg = '(B) base /api GET number query';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_base_get_number_query_fail) Fail base GET number query
						t.fail('(B) base /api GET number query: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_get) Test REST GET
				return request(app.rest)
					.get('/rest')
					.then(res => {
						t.comment('(C) tests on REST app');
						
						// (test_rest_get_pass) Pass REST GET
						var query = {};
						var actual = res.body;
						var msg = '(C) REST /rest GET';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_rest_get_fail) Fail REST GET
						t.fail('(C) REST /rest GET: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_get_string_query) Test REST GET string query
				return request(app.rest)
					.get('/rest?q[c]=b&q[b]=a')
					.then(res => {
						
						// (test_rest_get_string_query_pass) Pass REST GET string query
						var query = {c: 'b', b: 'a'};
						var actual = res.body;
						var msg = '(C) REST /rest GET string query';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_rest_get_string_query_fail) Fail REST GET string query
						t.fail('(C) REST /rest GET string query: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_get_number_query) Test REST GET number query
				return request(app.rest)
					.get('/rest?q[a][$gt]=1&q[d][$lt]=10')
					.then(res => {
						
						// (test_rest_get_number_query_pass) Pass REST GET number query
						var query = {a: {$gt: 1}, d: {$lt: 10}};
						var actual = res.body;
						var msg = '(C) REST /rest GET number query';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_rest_get_number_query_fail) Fail REST GET number query
						t.fail('(C) REST /rest GET number query: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_get_or_string_query) Test REST GET or string query
				return request(app.rest)
					.get('/rest?q[$or][0][b]=b&q[$or][1][c]=b')
					.then(res => {
						
						// (test_rest_get_or_string_query_pass) Pass REST GET or string query
						var query = {$or: [{b: 'b'}, {c: 'b'}]};
						var actual = res.body;
						var msg = '(C) REST /rest GET OR string query';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_rest_get_or_string_query_fail) Fail REST GET or string query
						t.fail('(C) REST /rest GET OR string query: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_post) Test REST POST
				return request(app.rest)
					.post('/rest?docs[0][lvl]=9000&docs[1][msg]=itsover')
					.then(res => {
						
						// (test_rest_post_pass) Pass REST POST
						var query = {$or: [{lvl: '9000'}, {msg: 'itsover'}]};
						var actual = [{lvl: '9000'}, {msg: 'itsover'}];
						var msg = '(C) REST /rest POST';
						return mongoGET(app, collection, query, t, actual, msg, {projection: {_id: 0}});
					})
					.catch(err => {
						
						// (test_rest_post_fail) Fail REST POST
						t.fail('(C) REST /rest POST: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_put) Test REST PUT
				return request(app.rest)
					.put('/rest?q[lvl][$exists]=1&update[$set][lvl]=9999')
					.then(res => {
						
						// (test_rest_put_pass) Pass REST PUT
						var query = {lvl: {$gte: 9000}};
						var actual = [{lvl: 9999}];
						var msg = '(C) REST /rest PUT';
						return mongoGET(app, collection, query, t, actual, msg, {projection: {_id: 0}});
					})
					.catch(err => {
						
						// (test_rest_put_fail) Fail REST PUT
						t.fail('(C) REST /rest PUT: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_rest_delete) Test REST DELETE
				return request(app.rest)
					.delete('/rest?q[a][$exists]=1')
					.then(res => {
						
						// (test_rest_delete_pass) Pass REST PUT
						var query = {};
						var actual = [{lvl: 9999}, {msg: 'itsover'}];
						var msg = '(C) REST /rest DELETE';
						return mongoGET(app, collection, query, t, actual, msg, {projection: {_id: 0}});
					})
					.catch(err => {
						
						// (test_rest_delete_fail) Fail REST DELETE
						t.fail('(C) REST /rest DELETE: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.catch(err => {
				
				// (test_insert_fail) Fail to insert data
				t.fail('(MAIN) insertMany: ' + err.message);
				return mongoEnd(db, client, t);
			})
			.then(() => {
				return mongoEnd(db, client, t);
			});
	});
	t.end();
});


