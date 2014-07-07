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

var logger = require('./logger.js');
var when = require('when');
var extend = require('xtend');
var fs = require('fs');
var path = require('path');
var settings = require('../settings.js');
var ursa = require('ursa');

var utilities;
module.exports = {

    /**
     * ensures the function in the provided scope
     * @param fn
     * @param scope
     * @returns {Function}
     */
    proxy: function (fn, scope) {
        return function () {
            try {
                return fn.apply(scope, arguments);
            }
            catch (ex) {
                logger.error(ex);
                logger.error(ex.stack);
                logger.log('error bubbled up ' + ex);
            }
        };
    },

    /**
     * Surely there is a better way to do this.
     * NOTE! This function does NOT short-circuit when an in-equality is detected.  This is
     * to avoid timing attacks.
     * @param left
     * @param right
     */
    bufferCompare: function (left, right) {
        if ((left == null) && (right == null)) {
            return true;
        }
        else if ((left == null) || (right == null)) {
            return false;
        }

        if (!Buffer.isBuffer(left)) {
            left = new Buffer(left);
        }
        if (!Buffer.isBuffer(right)) {
            right = new Buffer(right);
        }

        //logger.log('left: ', left.toString('hex'), ' right: ', right.toString('hex'));

        var same = (left.length == right.length),
            i = 0,
            max = left.length;

        while (i < max) {
            same &= (left[i] == right[i]);
            i++;
        }

        return same;
    },

    /**
     * Iterates over the properties of the right object, checking to make
     * sure the properties on the left object match.
     * @param left
     * @param right
     */
    leftHasRightFilter: function (left, right) {
        if (!left && !right) {
            return true;
        }
        var matches = true;

        for (var prop in right) {
            if (!right.hasOwnProperty(prop)) {
                continue;
            }
            matches &= (left[prop] == right[prop]);
        }
        return matches;
    },

    promiseDoFile: function (filename, callback) {
        var deferred = when.defer();
        fs.exists(filename, function (exists) {
            if (!exists) {
                logger.error("File: " + filename + " doesn't exist.");
                deferred.reject();
            }
            else {
                fs.readFile(filename, function (err, data) {
                    if (err) {
                        logger.error("error reading " + filename, err);
                        deferred.reject();
                    }

                    if (callback(data)) {
                        deferred.resolve();
                    }
                });
            }
        });
        return deferred;
    },

    promiseStreamFile: function (filename) {
        var deferred = when.defer();
        try {
            fs.exists(filename, function (exists) {
                if (!exists) {
                    logger.error("File: " + filename + " doesn't exist.");
                    deferred.reject();
                }
                else {
                    var readStream = fs.createReadStream(filename);

                    //TODO: catch can't read file stuff.

                    deferred.resolve(readStream);
                }
            });
        }
        catch (ex) {
            logger.error('promiseStreamFile: ' + ex);
            deferred.reject("promiseStreamFile said " + ex);
        }
        return deferred;
    },

    bufferToHexString: function (buf) {
        if (!buf || (buf.length <= 0)) {
            return null;
        }

        var r = [];
        for (var i = 0; i < buf.length; i++) {
            if (buf[i] < 10) {
                r.push('0');
            }
            r.push(buf[i].toString(16));
        }
        return r.join('');
    },

    toHexString: function (val) {
        return ((val < 10) ? '0' : '') + val.toString(16);
    },

    arrayContains: function (arr, obj) {
        if (arr && (arr.length > 0)) {
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] == obj) {
                    return true;
                }
            }
        }
        return false;
    },

    arrayContainsLower: function (arr, str) {
        if (arr && (arr.length > 0)) {
            str = str.toLowerCase();

            for (var i = 0; i < arr.length; i++) {
                var key = arr[i];
                if (!key) {
                    continue;
                }

                if (key.toLowerCase() == str) {
                    return true;
                }
            }
        }
        return false;
    },

    /**
     * filename should be relative from wherever we're running the require, sorry!
     * @param filename
     * @returns {*}
     */
    tryRequire: function (filename) {
        try {
            return require(filename);
        }
        catch (ex) {
            logger.error("tryRequire error " + filename, ex);
        }
        return null;
    },

    tryMixin: function (destObj, newObj) {
        try {
            return extend(destObj, newObj);
        }
        catch (ex) {
            logger.error("tryMixin error" + ex);
        }
        return destObj;
    },

    /**
     * recursively create a list of all files in a directory and all subdirectories
     * @param dir
     * @param search
     * @returns {Array}
     */
    recursiveFindFiles: function (dir, search, excludedDirs) {
        excludedDirs = excludedDirs || [];

        var result = [];
        var files = fs.readdirSync(dir);
        for (var i = 0; i < files.length; i++) {
            var fullpath = path.join(dir, files[i]);
            var stat = fs.statSync(fullpath);
            if (stat.isDirectory() && (!excludedDirs.contains(fullpath))) {
                result = result.concat(utilities.recursiveFindFiles(fullpath, search));
            }
            else if (!search || (fullpath.indexOf(search) >= 0)) {
                result.push(fullpath);
            }
        }
        return result;
    },

    /**
     * handle an array of stuff, in order, and don't stop if something fails.
     * @param arr
     * @param handler
     * @returns {promise|*|Function|Promise|when.promise}
     */
    promiseDoAllSequentially: function (arr, handler) {
        var tmp = when.defer();
        var index = -1;
        var results = [];

        var doNext = function () {
            try {
                index++;

                if (index > arr.length) {
                    tmp.resolve(results);
                }

                var file = arr[index];
                var promise = handler(file);
                if (promise) {
                    when(promise).then(function (result) {
                        results.push(result);
                        process.nextTick(doNext);
                    }, function () {
                        process.nextTick(doNext);
                    });
//                    when(promise).ensure(function () {
//                        process.nextTick(doNext);
//                    });
                }
                else {
                    //logger.log('skipping bad promise');
                    process.nextTick(doNext);
                }
            }
            catch (ex) {
                logger.error("pdas error: " + ex);
            }
        };

        process.nextTick(doNext);

        return tmp.promise;
    },

    endsWith:  function(str, sub) {
        if (!str || !sub) {
            return false;
        }

        var idx = str.indexOf(sub);
        return (idx == (str.length - sub.length));
    },
    getFilenameExt: function (filename) {
        if (!filename || (filename.length === 0)) {
            return filename;
        }

        var idx = filename.lastIndexOf('.');
        if (idx >= 0) {
            return filename.substr(idx);
        }
        else {
            return filename;
        }
    },
    filenameNoExt: function (filename) {
        if (!filename || (filename.length === 0)) {
            return filename;
        }

        var idx = filename.lastIndexOf('.');
        if (idx >= 0) {
            return filename.substr(0, idx);
        }
        else {
            return filename;
        }
    },

    get_core_key: function(coreid, callback) {
        var keyFile = path.join(global.settings.coreKeysDir || settings.coreKeysDir, coreid + ".pub.pem");
        if (!fs.existsSync(keyFile)) {
            logger.log("Expected to find public key for core " + coreid + " at " + keyFile);
            return null;
        }
        else {
            var keyStr = fs.readFileSync(keyFile).toString();
            var public_key = ursa.createPublicKey(keyStr, 'binary');
            callback(public_key);
        }


    },


    foo: null
};
utilities = module.exports;
