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


var when = require("when");
var extend = require("xtend");
var IFlasher = require("./IFlasher");
var messages = require('./Messages.js');
var logger = require('../lib/logger.js');
var utilities = require("../lib/utilities.js");
var BufferStream = require("./BufferStream.js");

var buffers = require('h5.buffers');
var Message = require('h5.coap').Message;
var Option = require('h5.coap/lib/Option.js');
var crc32 = require('buffer-crc32');


//
//UpdateBegin — sent by Server to initiate an OTA firmware update
//UpdateReady — sent by Core to indicate readiness to receive firmware chunks
//Chunk — sent by Server to send chunks of a firmware binary to Core
//ChunkReceived — sent by Core to respond to each chunk, indicating the CRC of the received chunk data.  if Server receives CRC that does not match the chunk just sent, that chunk is sent again
//UpdateDone — sent by Server to indicate all firmware chunks have been sent
//

var Flasher = function (options) {};


Flasher.stages = { PREPARE: 0, BEGIN_UPDATE: 1, SEND_FILE: 2, TEARDOWN: 3, DONE: 4 };
//Flasher.prototype = Object.create(IFlasher.prototype, { constructor: { value: IFlasher }});
Flasher.CHUNK_SIZE = 256;

Flasher.prototype = extend(IFlasher.prototype, {
    client: null,
    stage: 0,

    lastCrc: null,
    chunk: null,

    startFlashFile: function (filename, client, onSuccess, onError) {
        this.filename = filename;
        this.client = client;
        this.onSuccess = onSuccess;
        this.onError = onError;

        this.startTime = new Date();

        if (this.claimConnection()) {
            this.stage = 0;
            this.nextStep();
        }
    },
    startFlashBuffer: function (buffer, client, onSuccess, onError, onStarted) {
        this.fileBuffer = buffer;
        this.client = client;
        this.onSuccess = onSuccess;
        this.onError = onError;
        this.onStarted = onStarted;

        if (this.claimConnection()) {
            this.stage = 0;
            this.nextStep();
        }
    },

    claimConnection: function() {
        //suspend all other messages to the core
        if (!this.client.takeOwnership(this)) {
            this.failed("Flasher: Unable to take ownership");
            return false;
        }
        return true;
    },

    nextStep: function (data) {
        var that = this;
        process.nextTick(function () { that._nextStep(data); });
    },

    _nextStep: function (data) {
        switch (this.stage) {
            case Flasher.stages.PREPARE:
                this.prepare();
                break;

            case Flasher.stages.BEGIN_UPDATE:
                this.begin_update();
                break;
            case Flasher.stages.SEND_FILE:
                this.send_file();
                break;

            case Flasher.stages.TEARDOWN:
                this.teardown();
                break;

            case Flasher.stages.DONE:
                break;

            default:
                logger.log("Flasher, what stage was this? " + this.stage);
                break;
        }
    },

    failed: function (msg) {
        if (msg) {
            logger.error("Flasher failed " + msg);
        }

        this.cleanup();

        if (this.onError) {
            this.onError(msg);
        }
    },


    prepare: function () {


        //make sure we have a file,
        //  open a stream to our file

        if (this.fileBuffer) {
            if (this.fileBuffer.length == 0) {
                this.failed("Flasher: this.fileBuffer was empty.");
            }
            else {
                if (!Buffer.isBuffer(this.fileBuffer)) {
                    this.fileBuffer = new Buffer(this.fileBuffer);
                }

                this.fileStream = new BufferStream(this.fileBuffer);
                this.stage++;
                this.nextStep();
            }
        }
        else {
            var that = this;
            utilities.promiseStreamFile(this.filename)
                .promise
                .then(function (readStream) {
                    that.fileStream = readStream;
                    that.stage++;
                    that.nextStep();
                }, that.failed);
        }

        this.chunk = null;
        this.lastCrc = null;

        //start listening for missed chunks before the update fully begins
        this.client.on("msg_chunkmissed", this.onChunkMissed.bind(this));
    },
    teardown: function () {
        this.cleanup();

        //we succeeded, short-circuit the error function so we don't count more errors than appropriate.
        this.onError = function(err) {
            logger.log("Flasher - already succeeded, not an error: " + err);
        };

        if (this.onSuccess) {
            var that = this;
            process.nextTick(function () { that.onSuccess(); });
        }
    },

    cleanup: function () {
        try {
            //resume all other messages to the core
            this.client.releaseOwnership(this);

            //release our file handle
            if (this.fileStream) {
                if (this.fileStream.end) {
                    this.fileStream.end();
                }
                if (this.fileStream.close) {
                    this.fileStream.close();
                }

                this.fileStream = null;
            }

            //release our listeners?
            if (this._chunkReceivedHandler) {
                this.client.removeListener("ChunkReceived", this._chunkReceivedHandler);
                this._chunkReceivedHandler = null;
            }

            //cleanup when we're done...
            this.clearWatch("UpdateReady");
            this.clearWatch("CompleteTransfer");
        }
        catch (ex) {
            logger.error("Flasher: error during cleanup " + ex);
        }
    },


    begin_update: function () {
        var that = this;
        var maxTries = 3;
        var resendDelay = 6;    //NOTE: this is 6 because it's double the ChunkMissed 3 second delay

        //wait for UpdateReady — sent by Core to indicate readiness to receive firmware chunks
        this.client.listenFor("UpdateReady", null, null, function () {
            that.clearWatch("UpdateReady");

            that.stage++;
            //that.stage = Flasher.stages.SEND_FILE; //in we ever decide to make this listener re-entrant

            that.nextStep();

            if (that.onStarted) {
                process.nextTick(function () { that.onStarted(); });
            }
        }, true);


        var tryBeginUpdate = function() {
            if (maxTries > 0) {
                that.failWatch("UpdateReady", resendDelay, tryBeginUpdate);

                //UpdateBegin — sent by Server to initiate an OTA firmware update
                that.client.sendMessage("UpdateBegin", null, null, null, that.failed, that);

                maxTries--;
            }
            else if (maxTries == 0) {
               //give us one last LONG wait, for really really slow connections.
               that.failWatch("UpdateReady", 90, tryBeginUpdate);
               that.client.sendMessage("UpdateBegin", null, null, null, that.failed, that);
               maxTries--;
            }
            else {
                that.failed("Failed waiting on UpdateReady - out of retries ");
            }
        };
        //this.failWatch("UpdateReady", 60, utilities.proxy(this.failed, this));

        tryBeginUpdate();
    },

    send_file: function () {
        this.chunk = null;
        this.lastCrc = null;

        //while iterating over our file...
        //Chunk — sent by Server to send chunks of a firmware binary to Core
        //ChunkReceived — sent by Core to respond to each chunk, indicating the CRC of the received chunk data.  if Server receives CRC that does not match the chunk just sent, that chunk is sent again

        //send when ready:
        //UpdateDone — sent by Server to indicate all firmware chunks have been sent


        this._chunkReceivedHandler = this.onChunkResponse.bind(this);
        this.client.listenFor("ChunkReceived", null, null, this._chunkReceivedHandler, false);

        this.failWatch("CompleteTransfer", 600, this.failed.bind(this));

        //get it started.
        this.readNextChunk();
        this.sendChunk();
    },

    readNextChunk: function () {
        if (!this.fileStream) {
            logger.error("Asked to read a chunk after the update was finished");
        }

        this.chunk = (this.fileStream) ? this.fileStream.read(Flasher.CHUNK_SIZE) : null;

        //workaround for https://github.com/spark/core-firmware/issues/238
        if (this.chunk && (this.chunk.length != Flasher.CHUNK_SIZE)) {
            var buf = new Buffer(Flasher.CHUNK_SIZE);
            this.chunk.copy(buf, 0, 0, this.chunk.length);
            buf.fill(0, this.chunk.length, Flasher.CHUNK_SIZE);
            this.chunk = buf;
        }
        //end workaround

        this.lastCrc = (this.chunk) ? crc32.unsigned(this.chunk) : null;
    },

    sendChunk: function () {
        if (this.chunk) {
            var encodedCrc = messages.ToBinary(this.lastCrc, 'crc');
            //logger.log('crc is ', this.lastCrc, ' hex is ', encodedCrc.toString('hex'));

            var writeCoapUri = function (msg) {
                msg.addOption(new Option(Message.Option.URI_PATH, new Buffer("c")));
                msg.addOption(new Option(Message.Option.URI_QUERY, encodedCrc));
                return msg;
            };

            this.client.sendMessage("Chunk", {
                crc: encodedCrc,
                _writeCoapUri: writeCoapUri
            }, this.chunk, null, null, this);
        }
        else {
            this.onAllChunksDone();
        }
    },
    onChunkResponse: function (msg) {
        //did the core say the CRCs matched?
        if (messages.statusIsOkay(msg)) {
            this.readNextChunk();
        }

        if (!this.chunk) {
            this.onAllChunksDone();
        }
        else {
            this.sendChunk();
        }
    },

    onAllChunksDone: function() {
        logger.log('on response, no chunk, transfer done!');
        if (this._chunkReceivedHandler) {
            this.client.removeListener("ChunkReceived", this._chunkReceivedHandler);
        }
        this._chunkReceivedHandler = null;
        this.clearWatch("CompleteTransfer");

        if (!this.client.sendMessage("UpdateDone", null, null, null, null, this)) {
            logger.log("Flasher - failed sending updateDone message");
        }
        this.stage = Flasher.stages.TEARDOWN;
        this.nextStep();
    },


    onChunkMissed: function (msg) {
        logger.log('flasher - chunk missed - recovering');

        //grab last two bytes of PAYLOAD
        var idx = messages.FromBinary(msg.getPayload(), "uint16");
        if (typeof idx == "undefined") {
            logger.error("flasher - Got ChunkMissed, index was undefined");
            return;
        }

        this.client.sendReply("ChunkMissedAck", msg.getId(), null, null, null, this);

        //seek
        var offset = idx * Flasher.CHUNK_SIZE;
        this.fileStream.seek(offset);

        //re-send
        this.readNextChunk();
        this.sendChunk();
    },


    /**
     * Helper for managing a set of named timers and failure callbacks
     * @param name
     * @param seconds
     * @param callback
     */
    failWatch: function (name, seconds, callback) {
        if (!this._timers) {
            this._timers = {};
        }
        if (!seconds) {
            clearTimeout(this._timers[name]);
            delete this._timers[name];
        }
        else {
            this._timers[name] = setTimeout(function () {
                //logger.error("Flasher failWatch failed waiting on " + name);
                if (callback) {
                    callback("failed waiting on " + name);
                }
            }, seconds * 1000);
        }
    },
    _timers: null,
    clearWatch: function (name) {
        this.failWatch(name, 0, null);
    },


    foo: null
});
module.exports = Flasher;
