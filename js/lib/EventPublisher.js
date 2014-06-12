var when = require('when');
var extend = require('xtend');
var settings = require("../settings");
var utilities = require("./utilities.js");
var EventEmitter = require('events').EventEmitter;

var EventPublisher = function() {
    EventEmitter.call(this);
};
EventPublisher.prototype = {

    publish: function(isPublic, name, userid, data, ttl, published_at) {

        //TODO: this!

    },
    subscribe: function(eventName, callback) {

        //TODO: this!

    },




    close: function() {
        try {
            this.removeAllListeners();
        }
        catch (ex) {
            logger.error("EventPublisher: error thrown during close " + ex);
        }
    }
};
EventPublisher.prototype = extend(EventPublisher.prototype, EventEmitter.prototype);
module.exports = EventPublisher;

