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
var logger = require('../lib/logger.js');

/**

 Our job here is to accept messages in whole chunks, and put their length in front
 as we send them out, and parse them back into those size chunks as we read them in.

 **/

var ChunkingUtils = {
    MSG_LENGTH_BYTES: 2,
    msgLengthBytes: function (msg) {
        //that.push(ciphertext.length);
        //assuming a maximum encrypted message length of 65K, lets write an unsigned short int before every message,
        //so we know how much to read out.

        if (!msg) {
            //logger.log('msgLengthBytes - message was empty');
            return null;
        }

        var len = msg.length,
            lenBuf = new Buffer(ChunkingUtils.MSG_LENGTH_BYTES);

        lenBuf[0] = len >>> 8;
        lenBuf[1] = len & 255;

        //logger.log("outgoing message length was " + len);
        return lenBuf;
    }
};


var ChunkingStream = function (options) {
    Transform.call(this, options);
    this.outgoing = !!options.outgoing;
    this.incomingBuffer = null;
    this.incomingIdx = -1;
};
ChunkingStream.INCOMING_BUFFER_SIZE = 1024;

ChunkingStream.prototype = Object.create(Transform.prototype, { constructor: { value: ChunkingStream }});
ChunkingStream.prototype._transform = function (chunk, encoding, callback) {

    if (this.outgoing) {
        //we should be passed whole messages here.
        //write our length first, then message, then bail.

        this.push( Buffer.concat([ ChunkingUtils.msgLengthBytes(chunk), chunk ]));
        process.nextTick(callback);
    }
    else {
        //collect chunks until we hit an expected size, and then trigger a readable
        try {
            this.process(chunk, callback);
        }
        catch(ex) {
            logger.error("ChunkingStream error!: " + ex);
        }

    }
};
ChunkingStream.prototype.process = function(chunk, callback) {
    if (!chunk) {
        //process.nextTick(callback);
        return;
    }
    //logger.log("chunk received ", chunk.length, chunk.toString('hex'));

    var isNewMessage = (this.incomingIdx == -1);
    var startIdx = 0;
    if (isNewMessage) {
        this.expectedLength = ((chunk[0] << 8) + chunk[1]);

        //if we don't have a buffer, make one as big as we will need.
        this.incomingBuffer = new Buffer(this.expectedLength);
        this.incomingIdx = 0;
        startIdx = 2;   //skip the first two.
        //logger.log('hoping for message of length ' + this.expectedLength);
    }

    var remainder = null;
    var bytesLeft = this.expectedLength - this.incomingIdx;
    var endIdx = startIdx + bytesLeft;
    if (endIdx > chunk.length) {
        endIdx = chunk.length;
    }
    //startIdx + Math.min(chunk.length - startIdx, bytesLeft);

    if (startIdx < endIdx) {
        //logger.log('copying to incoming, starting at ', this.incomingIdx, startIdx, endIdx);
        if (this.incomingIdx >= this.incomingBuffer.length) {
            logger.log("hmm, shouldn't end up here.");
        }
        chunk.copy(this.incomingBuffer, this.incomingIdx, startIdx, endIdx);
    }
    this.incomingIdx += endIdx - startIdx;


    if (endIdx < chunk.length) {
        remainder = new Buffer(chunk.length -  endIdx);
        chunk.copy(remainder, 0, endIdx, chunk.length);
    }

    if (this.incomingIdx == this.expectedLength) {
        //logger.log("received msg of length" + this.incomingBuffer.length, this.incomingBuffer.toString('hex'));
        this.push(this.incomingBuffer);
        this.incomingBuffer = null;
        this.incomingIdx = -1;
        this.expectedLength = -1;
        this.process(remainder, callback);
    }
    else {
        //logger.log('fell through ', this.incomingIdx, ' and ', this.expectedLength, ' remainder ', (remainder) ? remainder.length : 0);
        process.nextTick(callback);
        callback = null;    //yeah, don't call that twice.
    }

    if (!remainder && callback) {
        process.nextTick(callback);
        callback = null;    //yeah, don't call that twice.
    }
};


module.exports = ChunkingStream;