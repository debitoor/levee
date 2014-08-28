'use strict';

var test = require('tape');
var http = require('http');
var Breaker = require('../lib/breaker');
var Defaults = require('../lib/defaults');


var command = {
    execute: function execute(value, callback) {
        callback(null, value);
    }
};

var failure = {
    execute: function execute(value, callback) {
        callback(new Error(value));
    }
};

var timeout = {
    execute: function execute(value, callback) {
        setTimeout(callback, 20, 'ok');
    }
};


test('api', function (t) {
    var levee;

    levee = new Breaker(command);

    // API
    t.ok(levee);
    t.ok(levee.run);
    t.ok(levee.isOpen);
    t.ok(levee.isHalfOpen);
    t.ok(levee.isClosed);
    t.ok(levee.open);
    t.ok(levee.halfOpen);
    t.ok(levee.close);

    // No fallback by default
    t.notOk(levee.fallback);

    // Settings
    t.ok(levee.settings);
    t.equal(levee.settings.maxFailures,  Defaults.Breaker.maxFailures);
    t.equal(levee.settings.timeout,      Defaults.Breaker.timeout);
    t.equal(levee.settings.resetTimeout, Defaults.Breaker.resetTimeout);

    // State
    t.ok(levee.isClosed());
    t.notOk(levee.isOpen());
    t.notOk(levee.isHalfOpen());

    t.end();
});


test('states', function (t) {
    var options, breaker;

    options = { resetTimeout: 50 };
    breaker = new Breaker(command, options);

    // Default state
    t.ok(breaker.isClosed());

    breaker.open();
    t.ok(breaker.isOpen());
    t.notOk(breaker.isClosed());
    t.notOk(breaker.isHalfOpen());

    breaker.halfOpen();
    t.notOk(breaker.isOpen());
    t.notOk(breaker.isClosed());
    t.ok(breaker.isHalfOpen());

    breaker.close();
    t.notOk(breaker.isOpen());
    t.ok(breaker.isClosed());
    t.notOk(breaker.isHalfOpen());

    // Break the Breaker
    breaker.open();
    t.ok(breaker.isOpen());

    setTimeout(function () {

        // Reset timeout expired, so should be half-open.
        t.ok(breaker.isHalfOpen());

        breaker.run('ok', function (err, data) {
            // Succeeded, so half-open should transition to closed.
            t.error(err);
            t.ok(data);
            t.ok(breaker.isClosed());
            t.end();
        });

    }, options.resetTimeout * 2);

});


test('failure', function (t) {
    var breaker;

    breaker = new Breaker(failure, { maxFailures: 1 });

    t.ok(breaker.isClosed());

    breaker.run('not ok', function (err, data) {
        t.ok(err);
        t.equal(err.message, 'not ok');
        t.notOk(data);
        t.ok(breaker.isOpen());

        breaker.run('not ok', function (err, data) {
            t.ok(err);
            t.equal(err.message, 'Command not available.');
            t.notOk(data);
            t.ok(breaker.isOpen());
            t.end();
        });
    });
});


test('fallback', function (t) {
    var breaker, fallback;

    breaker = new Breaker(failure, { maxFailures: 1 });
    breaker.fallback = fallback = new Breaker(command);

    t.plan(8);
    t.ok(breaker.isClosed());
    t.ok(fallback.isClosed());

    breaker.on('failure', function () {
        t.ok('failed');
    });

    fallback.on('success', function () {
        t.ok('succeeded');
    });

    breaker.run('not ok', function (err, data) {
        t.error(err);
        t.ok(data);
        t.ok(breaker.isOpen());
        t.ok(fallback.isClosed());
        t.end();
    });
});


test('success with fallback', function (t) {
    var breaker, fallback;

    breaker = new Breaker(command);
    breaker.fallback = fallback = new Breaker(command);

    t.ok(breaker.isClosed());

    breaker.run('ok', function (err, data) {
        t.error(err);
        t.equal(data, 'ok');
        t.ok(breaker.isClosed());
        t.end();
    });
});


test('timeout', function (t) {
    var breaker;

    breaker = new Breaker(timeout, { timeout: 10, maxFailures: 1 });

    t.ok(breaker.isClosed());

    breaker.run('ok', function (err, data) {
        t.ok(err);
        t.equal(err.message, 'Command timeout.');
        t.notOk(data);
        t.ok(breaker.isOpen());
        t.end();
    });
});


test('multiple failures', function (t) {
    var breaker;

    breaker = new Breaker(failure);

    t.ok(breaker.isClosed());

    breaker.run('not ok', function (err, data) {
        t.ok(err);
        t.equal(err.message, 'not ok');
        t.notOk(data);
        t.ok(breaker.isClosed());

        breaker.run('not ok', function (err, data) {
            t.ok(err);
            t.equal(err.message, 'not ok');
            t.notOk(data);
            t.ok(breaker.isClosed());
            t.end();
        });
    });
});