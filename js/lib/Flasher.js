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

var Flasher = function(options) {
	this.chunk_size = Flasher.CHUNK_SIZE;
};


Flasher.stages = { PREPARE: 0, BEGIN_UPDATE: 1, SEND_FILE: 2, TEARDOWN: 3, DONE: 4 };
//Flasher.prototype = Object.create(IFlasher.prototype, { constructor: { value: IFlasher }});
Flasher.CHUNK_SIZE = 256;
Flasher.MAX_CHUNK_SIZE = 594;
Flasher.MAX_MISSED_CHUNKS = 10;

Flasher.prototype = extend(IFlasher.prototype, {
    client: null,
    stage: 0,
	_protocolVersion: 0,
	_numChunksMissed: 0,
	_waitForChunksTimer: null,

    lastCrc: null,
    chunk: null,

	//
	// OTA tweaks
	//
	_fastOtaEnabled: false,
	_ignoreMissedChunks: false,


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

	setChunkSize: function(size) {
		this.chunk_size = size || Flasher.CHUNK_SIZE;
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
				this._chunkIndex = -1;
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
					that._chunkIndex = -1;
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
        this.client.listenFor("UpdateReady", null, null, function (msg) {
            that.clearWatch("UpdateReady");

			that.client.removeAllListeners("msg_updateabort");	//we got an ok, stop listening for err

			var version = 0;
			if (msg && (msg.getPayloadLength() > 0)) {
				version = messages.FromBinary(msg.getPayload(), "byte");
			}
			that._protocolVersion = version;

            that.stage++;
            //that.stage = Flasher.stages.SEND_FILE; //in we ever decide to make this listener re-entrant

            that.nextStep();

            if (that.onStarted) {
                process.nextTick(function () { that.onStarted(); });
            }
        }, true);

		this.client.listenFor("UpdateAbort", null, null, function(msg) {
			//client didn't like what we had to say.

			that.clearWatch("UpdateReady");
			var failReason = '';
			if (msg && (msg.getPayloadLength() > 0)) {
				failReason = messages.FromBinary(msg.getPayload(), "byte");
			}

			that.failed("aborted " + failReason);
		}, true);


        var tryBeginUpdate = function() {
			var sentStatus = true;

            if (maxTries > 0) {
                that.failWatch("UpdateReady", resendDelay, tryBeginUpdate);

				//(MDM Proposal) Optional payload to enable fast OTA and file placement:
				//u8  flags    0x01 - Fast OTA available - when set the server can provide fast OTA transfer
				//u16 chunk size	Each chunk will be this size apart from the last which may be smaller.
				//u32 file size		The total size of the file.
				//u8 destination 	Where to store the file
				//	0x00 Firmware update
				//	0x01 External Flash
				//	0x02 User Memory Function
				//u32 destination address (0 for firmware update, otherwise the address of external flash or user memory.)

				var flags = 0,	//fast ota available
					chunkSize = that.chunk_size,
					fileSize = that.fileBuffer.length,
					destFlag = 0,   //TODO: reserved for later
					destAddr = 0;   //TODO: reserved for later

				if (this._fastOtaEnabled) {
					logger.log("fast ota enabled! ", this.getLogInfo());
					flags = 1;
				}

				var bb = new buffers.BufferBuilder();
				bb.pushUInt8(flags);
				bb.pushUInt16(chunkSize);
				bb.pushUInt32(fileSize);
				bb.pushUInt8(destFlag);
				bb.pushUInt32(destAddr);


				//UpdateBegin — sent by Server to initiate an OTA firmware update
				sentStatus = that.client.sendMessage("UpdateBegin", null, bb.toBuffer(), null, that.failed, that);
                maxTries--;
            }
            else if (maxTries == 0) {
               //give us one last LONG wait, for really really slow connections.
               that.failWatch("UpdateReady", 90, tryBeginUpdate);
				sentStatus = that.client.sendMessage("UpdateBegin", null, null, null, that.failed, that);
               maxTries--;
            }
            else {
                that.failed("Failed waiting on UpdateReady - out of retries ");
            }

			// did we fail to send out the UpdateBegin message?
			if (sentStatus === false) {
				that.clearWatch("UpdateReady");
				that.failed("UpdateBegin failed - sendMessage failed");
			}
        };


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

		this.failWatch("CompleteTransfer", 600, this.failed.bind(this));

		if (this._protocolVersion > 0) {
			logger.log("flasher - experimental sendAllChunks!! - ", { coreID: this.client.getHexCoreID() });
			this._sendAllChunks();
		}
		else {
            this._chunkReceivedHandler = this.onChunkResponse.bind(this);
            this.client.listenFor("ChunkReceived", null, null, this._chunkReceivedHandler, false);

            this.failWatch("CompleteTransfer", 600, this.failed.bind(this));

            //get it started.
            this.readNextChunk();
            this.sendChunk();
		}
    },

	readNextChunk: function() {
		if (!this.fileStream) {
			logger.error("Asked to read a chunk after the update was finished");
		}

		this.chunk = (this.fileStream) ? this.fileStream.read(this.chunk_size) : null;
		//workaround for https://github.com/spark/core-firmware/issues/238
		if (this.chunk && (this.chunk.length != this.chunk_size)) {
			var buf = new Buffer(this.chunk_size);
			this.chunk.copy(buf, 0, 0, this.chunk.length);
			buf.fill(0, this.chunk.length, this.chunk_size);
			this.chunk = buf;
		}
		this._chunkIndex++;
		//end workaround
		this.lastCrc = (this.chunk) ? crc32.unsigned(this.chunk) : null;
	},

	sendChunk: function(chunkIndex) {
		var includeIndex = (this._protocolVersion > 0);

		if (this.chunk) {
			var encodedCrc = messages.ToBinary(this.lastCrc, 'crc');
			//            logger.log('sendChunk %s, crc hex is %s ', chunkIndex, encodedCrc.toString('hex'), this.getLogInfo());

			var writeCoapUri = function(msg) {
				msg.addOption(new Option(Message.Option.URI_PATH, new Buffer("c")));
				msg.addOption(new Option(Message.Option.URI_QUERY, encodedCrc));
				if (includeIndex) {
					var idxBin = messages.ToBinary(chunkIndex, "uint16");
					msg.addOption(new Option(Message.Option.URI_QUERY, idxBin));
				}
				return msg;
			};

			//			if (this._gotMissed) {
			//				console.log("sendChunk %s %s", chunkIndex, this.chunk.toString('hex'));
			//			}

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
		if (this._protocolVersion > 0) {
			// skip normal handling of this during fast ota.
			return;
		}

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

	_sendAllChunks: function() {
		this.readNextChunk();
		while (this.chunk) {
			this.sendChunk(this._chunkIndex);
			this.readNextChunk();
		}
		//this is fast ota, lets let them re-request every single chunk at least once,
		//then they'll get an extra ten misses.
		this._numChunksMissed = -1 * this._chunkIndex;

		//TODO: wait like 5-6 seconds, and 5-6 seconds after the last chunkmissed?
		this.onAllChunksDone();
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

		if (this._protocolVersion > 0) {
			this._chunkReceivedHandler = this._waitForMissedChunks.bind(this, true);
			this.client.listenFor("ChunkReceived", null, null, this._chunkReceivedHandler, false);

			//fast ota, lets stick around until 10 seconds after the last chunkmissed message
			this._waitForMissedChunks();
		}
		else {
			this.clearWatch("CompleteTransfer");
        this.stage = Flasher.stages.TEARDOWN;
        this.nextStep();
		}
    },


	/**
	 * delay the teardown until at least like 10 seconds after the last chunkmissed message.
	 * @private
	 */
	_waitForMissedChunks: function(wasAck) {
		if (this._protocolVersion <= 0) {
			//this doesn't apply to normal slow ota
			return;
		}

		//logger.log("HERE - _waitForMissedChunks wasAck?", wasAck);

		if (this._waitForChunksTimer) {
			clearTimeout(this._waitForChunksTimer);
		}

		this._waitForChunksTimer = setTimeout(this._waitForMissedChunksDone.bind(this), 60 * 1000);
	},

	/**
	 * fast ota - done sticking around for missing chunks
	 * @private
	 */
	_waitForMissedChunksDone: function() {
		if (this._chunkReceivedHandler) {
			this.client.removeListener("ChunkReceived", this._chunkReceivedHandler);
		}
		this._chunkReceivedHandler = null;

		//		logger.log("HERE - _waitForMissedChunks done waiting! ", this.getLogInfo());

		this.clearWatch("CompleteTransfer");

		this.stage = Flasher.stages.TEARDOWN;
		this.nextStep();
	},


	getLogInfo: function() {
		if (this.client) {
			return { coreID: this.client.getHexCoreID(), cache_key: this.client._connection_key };
		}
		else {
			return { coreID: "unknown" };
		}
	},

    onChunkMissed: function(msg) {
		this._waitForMissedChunks();
		//console.log("got chunk missed");
		//this._gotMissed = true;

		this._numChunksMissed++;
		if (this._numChunksMissed > Flasher.MAX_MISSED_CHUNKS) {

			logger.error('flasher - chunk missed - core over limit, killing! ', this.getLogInfo());
			this.failed();
			return;
		}

		// if we're not doing a fast OTA, and ignore missed is turned on, then ignore this missed chunk.
		if (!this._fastOtaEnabled && this._ignoreMissedChunks) {
			logger.log("ignoring missed chunk ", this.getLogInfo());
			return;
		}

		logger.log('flasher - chunk missed - recovering ', this.getLogInfo());

		//kosher if I ack before I've read the payload?
		this.client.sendReply("ChunkMissedAck", msg.getId(), null, null, null, this);

		//old method
		//var idx = messages.FromBinary(msg.getPayload(), "uint16");

		//the payload should include one or more chunk indexes
		var payload = msg.getPayload();
		var r = new buffers.BufferReader(payload);
		for(var i = 0; i < payload.length; i += 2) {
			try {
				var idx = r.shiftUInt16();
				this._resendChunk(idx);
			}
			catch (ex) {
				logger.error("onChunkMissed error reading payload " + ex);
			}
		}
	},

	_resendChunk: function(idx) {
		if (typeof idx == "undefined") {
			logger.error("flasher - Got ChunkMissed, index was undefined");
			return;
		}

		if (!this.fileStream) {
			return this.failed("ChunkMissed, fileStream was empty");
		}

		logger.log("flasher resending chunk " + idx);

		//seek
		var offset = idx * this.chunk_size;
		this.fileStream.seek(offset);
		this._chunkIndex = idx;

		//          if (this._protocolVersion > 0) {
		//				//THIS ASSUMES THIS HAPPENS once the transfer has fully finished.
		//				//if it happens mid stream, it'll move the filestream, and might disrupt the transfer.
		//			}

		//re-send
		this.readNextChunk();
		this.sendChunk(idx);
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
