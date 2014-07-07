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


var crypto = require('crypto');
var ursa = require('ursa');
var CryptoStream = require("./CryptoStream");
var when = require('when');
var fs = require('fs');
var utilities = require("../lib/utilities.js");
var logger = require('../lib/logger.js');


/*
    install full openssl
    http://slproweb.com/products/Win32OpenSSL.html
    http://www.microsoft.com/en-us/download/confirmation.aspx?id=15336
 */


/**
 * Static wrapper for the various Crypto libraries, we should ensure everything is thread safe
 * @constructor
 */
var CryptoLib;
module.exports = {
    classname: "CryptoLib",
    hashtype: 'sha1',
    signtype: 'sha256',

    randomBytes: function (size) {
        var deferred = when.defer();
        crypto.randomBytes(size, function (ex, buf) {
            deferred.resolve(ex, buf);
        });
        return deferred;
    },


    getRandomBytes: function (size, callback) {
        crypto.randomBytes(size, callback);
        //crypto.randomBytes(256, function(ex, buf) { if (ex) throw ex; logger.log('Have %d bytes of random data: %s', buf.length, buf); });
    },

//    getRandomUINT32: function () {
//        //unsigned 4 byte (32 bit) integers max should be 2^32
//        var max = 4294967296 - 1;       //Math.pow(2, 32) - 1
//
//        //give us a number between 1 and uintmax
//        return Math.floor((Math.random() * max) + 1);
//    },

    getRandomUINT16: function () {
        //unsigned 2 byte (16 bit) integers max should be 2^16
        var max = 65536 - 1;       //Math.pow(2, 16) - 1

        //give us a number between 1 and uintmax
        return Math.floor((Math.random() * max) + 1);
    },

    //
//var alice = crypto.getDiffieHellman('modp5');
//var bob = crypto.getDiffieHellman('modp5');
//
//alice.generateKeys();
//bob.generateKeys();

//    init: function () {
//        logger.log("generating temporary debug server keys");
//        CryptoLib.serverKeys = ursa.generatePrivateKey();
//
//        logger.log("generating temporary debug core keys");
//        CryptoLib.coreKeys = ursa.generatePrivateKey();
//    },

    _serverKeys: null,
    setServerKeys: function (key) {
        if (ursa.isKey(key)) {
            logger.log("set server key");
            CryptoLib._serverKeys = key;
        }
        else {
            logger.log("Hey! That's not a key BRO.");
        }
    },
    getServerKeys: function () {
        if (!CryptoLib._serverKeys) {
            CryptoLib._serverKeys = ursa.generatePrivateKey();
        }
        return CryptoLib._serverKeys;
    },

//    serverKeys: (function () {
//
//
//        logger.log("generating temporary debug server keys");
//        return ursa.generatePrivateKey();
//    })(),

    _coreKeys: null,
    setCoreKeys: function (key) {
        if (ursa.isKey(key)) {
            logger.log("set Core key");
            CryptoLib._coreKeys = key;
        }
        else {
            logger.log("Hey! That's not a key BRO.");
        }
    },
    getCoreKeys: function () {
        if (!CryptoLib._coreKeys) {
            CryptoLib._coreKeys = ursa.generatePrivateKey();
        }
        return CryptoLib._coreKeys;
    },


//    coreKeys: (function () {
//        logger.log("generating temporary debug core keys");
//        return ursa.generatePrivateKey();
//    })(),

    createPublicKey: function (key) {
        return ursa.createPublicKey(key);
    },

    encrypt: function (publicKey, data) {
        if (!publicKey) {
            return null;
        }
        if (!publicKey) {
            logger.error("encrypt: publicKey was null");
            return null;
        }

        //logger.log('encrypting ', data.length, data.toString('hex'));
        return publicKey.encrypt(data, undefined, undefined, ursa.RSA_PKCS1_PADDING);
    },
    decrypt: function (privateKey, data) {
        if (!privateKey) {
            privateKey = CryptoLib.getServerKeys();
        }
        if (!privateKey) {
            logger.error("decrypt: privateKey was null");
            return null;
        }
        if (!ursa.isPrivateKey(privateKey)) {
            logger.error("Trying to decrypt with non-private key");
            return null;
        }

        //logger.log('decrypting ', data.length, data.toString('hex'));
        return privateKey.decrypt(data, undefined, undefined, ursa.RSA_PKCS1_PADDING);
    },
    sign: function (privateKey, hash) {
        if (!privateKey) {
            privateKey = CryptoLib.getServerKeys();
        }
        //return privateKey.sign(CryptoLib.signtype, hash);
        return privateKey.privateEncrypt(hash);
    },
    verify: function (publicKey, hash, signature) {
        try {
            var plaintext = publicKey.publicDecrypt(signature);
            return utilities.bufferCompare(hash, plaintext);
        }
        catch (ex) {
            logger.error("hash verify error: " + ex);
        }
        return false;
        //return CryptoLib.serverKeys.verify(CryptoLib.signtype, hash, signature);
    },


    /**
     * Returns a readable/writeable aes 128 cbc stream for communicating
     * with the spark core
     * @param sessionKey
     * @returns {*}
     * @constructor
     */
    CreateAESCipher: function (sessionKey) {

        //The first 16 bytes (MSB first) will be the key, the next 16 bytes (MSB first) will be the initialization vector (IV), and the final 8 bytes (MSB first) will be the salt.
        var key = new Buffer(16); //just the key... +8); //key plus salt
        var iv = new Buffer(16); //initialization vector

        sessionKey.copy(key, 0, 0, 16); //copy the key
        //sessionKey.copy(key, 16, 32, 40); //append the 8-byte salt
        sessionKey.copy(iv, 0, 16, 32); //copy the iv

        //are we not be doing something with the salt here?

        return crypto.createCipheriv('aes-128-cbc', key, iv);
    },


    //_transform

    /**
     * Returns a readable/writeable aes 128 cbc stream for communicating
     * with the spark core
     * @param sessionKey
     * @returns {*}
     * @constructor
     */
    CreateAESDecipher: function (sessionKey) {
        //The first 16 bytes (MSB first) will be the key, the next 16 bytes (MSB first) will be the initialization vector (IV), and the final 8 bytes (MSB first) will be the salt.
        var key = new Buffer(16); //just the key... +8); //key plus salt
        var iv = new Buffer(16); //initialization vector

        sessionKey.copy(key, 0, 0, 16); //copy the key
        //sessionKey.copy(key, 16, 32, 40); //append the 8-byte salt?
        sessionKey.copy(iv, 0, 16, 32); //copy the iv

        //are we not be doing something with the salt here?

        return crypto.createDecipheriv('aes-128-cbc', key, iv);
    },


    CreateAESCipherStream: function (sessionKey) {
        //The first 16 bytes (MSB first) will be the key, the next 16 bytes (MSB first) will be the initialization vector (IV), and the final 8 bytes (MSB first) will be the salt.
        var key = new Buffer(16); //just the key... +8); //key plus salt
        var iv = new Buffer(16); //initialization vector

        sessionKey.copy(key, 0, 0, 16); //copy the key
        sessionKey.copy(iv, 0, 16, 32); //copy the iv

        return new CryptoStream({
            key: key,
            iv: iv,
            encrypt: true
        });
    },

    /**
     * Returns a readable/writeable aes 128 cbc stream for communicating
     * with the spark core
     * @param sessionKey
     * @returns {*}
     * @constructor
     */
    CreateAESDecipherStream: function (sessionKey) {
        //The first 16 bytes (MSB first) will be the key, the next 16 bytes (MSB first) will be the initialization vector (IV), and the final 8 bytes (MSB first) will be the salt.
        var key = new Buffer(16); //just the key... +8); //key plus salt
        var iv = new Buffer(16); //initialization vector

        sessionKey.copy(key, 0, 0, 16); //copy the key
        sessionKey.copy(iv, 0, 16, 32); //copy the iv

        return new CryptoStream({
            key: key,
            iv: iv,
            encrypt: false
        });
    },


    createHmacDigest: function (ciphertext, key) {
        var hmac = crypto.createHmac('sha1', key);
        hmac.update(ciphertext);
        return hmac.digest();
    },

    loadServerPublicKey: function(filename) {
        return utilities.promiseDoFile(filename,function (data) {
            //CryptoLib.setServerKeys(ursa.createPublicKey(data));
            CryptoLib.setServerKeys(ursa.createKey(data));
            logger.log("server public key is: ", CryptoLib.getServerKeys().toPublicPem('binary'));
            return true;
        }).promise;
    },

    loadServerKeys: function (filename, passFile, envVar) {

        var password = null;
        if (envVar && (envVar != '')) {
            password = process.env[envVar];

            if (!password) {
                logger.error("Certificate Password Environment Variable specified but not available");
            }
            else {
                password = new Buffer(password, 'base64');
            }
        }
        else if (passFile && (passFile != '') && (fs.existsSync(passFile))) {
            password = fs.readFileSync(passFile);

            if (!password) {
                logger.error("Certificate Password File specified but was empty");
            }
        }
        if (!password) {
            password = undefined;
        }

        //synchronous version
        if (!fs.existsSync(filename)) { return false; }

        var data = fs.readFileSync(filename);
        var keys = ursa.createPrivateKey(data, password);

        CryptoLib.setServerKeys(keys);
        logger.log("server public key is: ", keys.toPublicPem('binary'));
        return true;


//        return utilities.promiseDoFile(filename,function (data) {
//            CryptoLib.setServerKeys(ursa.createPrivateKey(data, password));
//            logger.log("server public key is: ", CryptoLib.getServerKeys().toPublicPem('binary'));
//            return true;
//        }).promise;
    },


    foo: null
};
CryptoLib = module.exports;
