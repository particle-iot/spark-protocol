/*
*   Copyright (c) 2015 Particle Industries, Inc.  All rights reserved.
*
*   This program is free software; you can redistribute it and/or
*   modify it under the terms of the GNU Lesser General Public
*   License as published by the Free Software Foundation, either
*   version 3 of the License, or (at your option) any later version.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
*   Lesser General Public License for more details.
*
*   You should have received a copy of the GNU Lesser General Public
*   License along with this program; if not, see <http://www.gnu.org/licenses/>.
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

