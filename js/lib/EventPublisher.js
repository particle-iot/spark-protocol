/*
*   Copyright (C) 2013-2014 Spark Labs, Inc. All rights reserved. -  https://www.spark.io/
*
*   This file is part of the Spark-protocol module
*
*   This program is free software: you can redistribute it and/or modify
*   it under the terms of the GNU General Public License version 3
*   as published by the Free Software Foundation.
*
*   Spark-protocol is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*   GNU General Public License for more details.
*
*   You should have received a copy of the GNU General Public License
*   along with Spark-protocol.  If not, see <http://www.gnu.org/licenses/>.
*
*   You can download the source here: https://github.com/spark/spark-protocol
*/


var when = require('when');
var extend = require('xtend');
var settings = require("../settings");
var logger = require('./logger.js');
var utilities = require("./utilities.js");
var EventEmitter = require('events').EventEmitter;

var EventPublisher = function () {
    EventEmitter.call(this);
};
EventPublisher.prototype = {

    publish: function (isPublic, name, userid, data, ttl, published_at, coreid) {

        process.nextTick((function () {
            this.emit(name, isPublic, name, userid, data, ttl, published_at, coreid);
            this.emit("*all*", isPublic, name, userid, data, ttl, published_at, coreid);
        }).bind(this));
    },
    subscribe: function (eventName, obj) {
        if (!eventName || (eventName == "")) {
            eventName = "*all*";
        }

        var handler = (function (isPublic, name, userid, data, ttl, published_at, coreid) {
            var emitName = (isPublic) ? "public" : "private";
            this.emit(emitName, name, data, ttl, published_at, coreid);
        }).bind(obj);
        obj[eventName + "_handler"] = handler;

        this.on(eventName, handler);
    },

    unsubscribe: function (eventName, obj) {
        var handler = obj[eventName + "_handler"];
        if (handler) {
            delete obj[eventName + "_handler"];
            this.removeListener(eventName, handler);
        }
    },


    close: function () {
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

