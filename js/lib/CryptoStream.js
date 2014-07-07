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


var Transform = require('stream').Transform;
var CryptoLib = require("./ICrypto");
var crypto = require('crypto');
var logger = require('../lib/logger.js');

var CryptoStream = function (options) {
    Transform.call(this, options);
    this.key = options.key;
    this.iv = options.iv;
    this.encrypt = !!options.encrypt;
};
CryptoStream.prototype = Object.create(Transform.prototype, { constructor: { value: CryptoStream }});
CryptoStream.prototype._transform = function (chunk, encoding, callback) {
    try {

        //assuming it comes in full size pieces
        var cipher = this.getCipher(callback);
        cipher.write(chunk);
        cipher.end();
        cipher = null;

        if (!this.encrypt) {
            //ASSERT: we just DECRYPTED an incoming message
            //THEN:
            //  update the initialization vector to the first 16 bytes of the encrypted message we just got
            this.iv = new Buffer(16);
            chunk.copy(this.iv, 0, 0, 16);

            //logger.log('server: GOT ENCRYPTED CHUNK', chunk.toString('hex'));
        }
//        else {
//            console.log('pre-encrypt sending: ' + chunk.toString('hex'));
//        }
    }
    catch (ex) {
        logger.error("CryptoStream transform error " + ex);
    }
};
CryptoStream.prototype.getCipher = function (callback) {
    var cipher = null;
    if (this.encrypt) {
        cipher = crypto.createCipheriv('aes-128-cbc', this.key, this.iv);
    }
    else {
        cipher = crypto.createDecipheriv('aes-128-cbc', this.key, this.iv);
    }

    var ciphertext = null,
        that = this;

    cipher.on('readable', function () {
        var chunk = cipher.read();

        if (!ciphertext) {
            ciphertext = chunk;
        }
        else {
            ciphertext = Buffer.concat([ciphertext, chunk], ciphertext.length + chunk.length);
        }
    });
    cipher.on('end', function () {
        //var action = (that.encrypt) ? "encrypting" : "decrypting";
        //logger.log(action + ' chunk to ', ciphertext.toString('hex'));

        that.push(ciphertext);

        if (that.encrypt) {
            //logger.log("ENCRYPTING WITH ", that.iv.toString('hex'));
            //get new iv for next time.
            that.iv = new Buffer(16);
            ciphertext.copy(that.iv, 0, 0, 16);

            //logger.log("ENCRYPTING WITH ", that.iv.toString('hex'));
        }
        ciphertext = null;

        callback();
    });

    return cipher;
};
module.exports = CryptoStream;

