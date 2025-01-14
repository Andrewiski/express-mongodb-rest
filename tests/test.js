// Richard Wen
// rrwen.dev@gmail.com


require('dotenv').config();

// (packages) Package dependencies
var api = require('../index.js');
var express = require('express');
var fs = require('fs');
var moment = require('moment');
var mongoClient = require('mongodb').MongoClient;
var request = require('supertest');
var test = require('tape');

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
	if(process.env.MONGODB_TESTDATABASE){
		process.env.MONGODB_DATABASE = process.env.MONGODB_TESTDATABASE;
	}
	
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
				baseApp.use('/api', api());
				
				// (test_app_rest) Create REST app
				var restApp = express();
				options = {mongodb: {}, rest: {}, test: {}};
				options.mongodb = {
					connection: process.env.MONGODB_CONNECTION,
					database: process.env.MONGODB_DATABASE,
					collection: process.env.MONGODB_COLLECTION
				};
				options.test = {
					testAllowDB: process.env.MONGODB_TESTALLOWDATABASE || "expressmongodbrest_database",
					collection: process.env.MONGODB_COLLECTION
				}
				options.rest.GET = {
					database: process.env.MONGODB_DATABASE,
					collection: process.env.MONGODB_COLLECTION,
					method: 'find'
				};
				options.rest.POST = {
					method: 'insertMany'
				};
				options.rest.PUT = {
					method: 'updateMany'
				};
				options.rest.DELETE = {
					method: 'deleteMany'
				};
				restApp.use('/rest', api(options));
				
				// (test_app_custom) Custom app to check additional options
				var customApp = express();
				customApp.use('/custom/:database/:collection/:method', api({
					express : {
						deny: {
							database: ['deny'],
							collection: ['deny'],
							code: 400
						},
						allow: {
							database: [options.test.testAllowDB],
							collection: ['rest_data', 'unknown_collection'],
							code: 400
						}
					},
					mongodb: {
						options: { maxPoolSize: 100}
					},
					rest: {
						GET: {
							query: {q: {}},
							handler: {
								count: function(req, res, next, data) {
									var collection = data.mongodb.collection;
									var query = data.rest.query;
									collection.count(query.q, query.options, function(err, result) {
										if (err) next(err);
										res.json({count: result});
									});
								}
							}
						}
					}
				}));
				
				// (test_app_return) Pass apps to thenables
				return {base: baseApp, rest: restApp, custom: customApp};
			})
			.then(app => {
				
				// (test_connect) Test and wait for mongodb connection
				return mongoClient.connect(process.env.MONGODB_CONNECTION)
					.then(client => {
						var db = client.db(process.env.MONGODB_DATABASE);
						var collection = db.collection(process.env.MONGODB_COLLECTION);
						
						// (test_connect_pass) Pass mongodb connection
						t.pass('(MAIN) MongoDB connect');
					})
					.catch(err => {
						
						// (test_connect_fail) Fail mongodb connection
						t.fail('(MAIN) MongoDB connect: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
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
				
				// (test_custom_get_200) Test custom GET response 200
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/' + options.test.collection + '/find')
					.expect(200)
					.then(res => {
						
						// (test_custom_get_200_pass) Pass custom GET response 200
						t.pass('(A) custom GET 200 success');
					})
					.catch(err => {
						
						// (test_custom_get_200_fail) Fail custom GET response 200
						t.fail('(A) custom GET 200 success: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_deny_database_400) Test custom GET deny database response 400
				return request(app.custom)
					.get('/custom/deny/rest/find')
					.expect(400)
					.then(res => {
						
						// (test_custom_get_deny_database_400_pass) Pass custom GET deny database response 400
						t.pass('(A) custom GET denied database 400 bad request');
					})
					.catch(err => {
						
						// (test_custom_get_deny_database_400_fail) Fail custom GET deny database response 400
						t.fail('(A) custom GET denied database 400 bad request: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_deny_collection_400) Test custom GET deny collection response 400
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/deny/find')
					.expect(400)
					.then(res => {
						
						// (test_custom_get_deny_collection_400_pass) Pass custom GET deny collection response 400
						t.pass('(A) custom GET denied collection 400 bad request');
					})
					.catch(err => {
						
						// (test_custom_get_deny_collection_400_fail) Fail custom GET deny collection response 400
						t.fail('(A) custom GET denied collection 400 bad request: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_allow_database_400) Test custom GET not allow database response 400
				return request(app.custom)
					.get('/custom/notallowed/' + options.test.collection + '/find')
					.expect(400)
					.then(res => {
						
						// (test_custom_get_allow_database_400_pass) Pass custom GET not allow database response 400
						t.pass('(A) custom GET not allowed database 400 bad request');
					})
					.catch(err => {
						
						// (test_custom_get_allow_database_400_fail) Fail custom GET not allow database response 400
						t.fail('(A) custom GET not allowed database 400 bad request: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_allow_collection_400) Test custom GET not allow collection response 400
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/allow/find')
					.expect(400)
					.then(res => {
						
						// (test_custom_get_allow_collection_400_pass) Pass custom GET not allow collection response 400
						t.pass('(A) custom GET not allowed collection 400 bad request');
					})
					.catch(err => {
						
						// (test_custom_get_allow_collection_400_fail) Fail custom GET not allow collection response 400
						t.fail('(A) custom GET not allowed collection 400 bad request: ' + err.message);
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
					.get('/api?q={"c": "b","b":"a"}')
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
					.get('/api?q={"a":{"$gt":1},"d":{"$lt":10}}')
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
					.get('/rest?q={}')
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
					.get('/rest?q={"c":"b","b":"a"}')
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
					.get('/rest?q={"a":{"$gt":1},"d":{"$lt":10}}')
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
					.get('/rest?q={"$or":[{"b":"b"},{"c":"b"}]}')
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
					.post('/rest?docs=[{"lvl":9000},{"msg":"itsover"}]')
					.then(res => {
						
						// (test_rest_post_pass) Pass REST POST
						var query = {lvl: {$exists: 1}};
						var actual = [{lvl: 9000}];
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
					.put('/rest?q={"lvl":{"$exists":1}}&update={"$set":{"lvl":9999}}')
					.then(res => {
						
						// (test_rest_put_pass) Pass REST PUT
						var query = {lvl: {$exists: 1}};
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
					.delete('/rest?q={"a":{"$exists":1}}')
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



			.then(app => {
				
				// (test_custom_get) Test custom GET
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/' + options.test.collection + 'a/find?q={}')
					.then(res => {
						t.comment('(D) tests on custom app');
						
						// (test_custom_get_pass) Pass custom GET
						var query = {};
						var actual = res.body;
						var msg = '(D) custom /custom GET';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_custom_get_fail) Fail custom GET
						t.fail('(D) custom /custom GET: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_query) Test custom GET query
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/' + options.test.collection + '/find?q={"lvl":{"$gt":9000}}')
					.then(res => {
						
						// (test_custom_get_query_pass) Pass custom GET query
						var query = {lvl: {$gt: 9000}};
						var actual = res.body;
						var msg = '(D) custom /custom GET query';
						return mongoGET(app, collection, query, t, actual, msg);
					})
					.catch(err => {
						
						// (test_custom_get_query_fail) Fail custom GET query
						t.fail('(D) custom /custom GET query: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_collection) Test custom GET unknown collection
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/unknown_collection/find?q={"lvl":{"$gt":9000}}')
					.then(res => {
						
						// (test_custom_get_collection_pass) Pass custom GET unknown collection
						var actual = res.body;
						var expected = [];
						var msg = '(D) custom /custom GET unknown collection';
						t.deepEquals(actual, expected, msg);
					})
					.catch(err => {
						
						// (test_custom_get_collection_fail) Fail custom GET unknown collection
						t.fail('(D) custom /custom GET unknown collection: ' + err.message);
						mongoEnd(db, client, t);
					})
					.then(() => {
						return app;
					});
			})
			.then(app => {
				
				// (test_custom_get_count) Test custom GET count
				return request(app.custom)
					.get('/custom/' + options.test.testAllowDB + '/' + options.test.collection + '/count')
					.then(res => {
						
						// (test_custom_get_count_pass) Pass custom GET count
						var actual = res.body;
						var expected = {count: 1};
						var msg = '(D) custom /custom GET count';
						t.deepEquals(actual, expected, msg);
					})
					.catch(err => {
						
						// (test_custom_get_count_fail) Fail custom GET count
						t.fail('(D) custom /custom GET count: ' + err.message);
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


