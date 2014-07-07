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

var BufferStream = function (buffer) { this.buf = buffer; };
BufferStream.prototype = {
    idx: 0,
    buf: null,
    seek: function(idx) {
        this.idx = idx;
    },
    read: function (size) {
        if (!this.buf) { return null; }

        var idx = this.idx,
            endIdx = idx + size;

        if (endIdx >= this.buf.length) {
            endIdx = this.buf.length;
        }

        var result = null;
        if ((endIdx - idx) > 0) {
            result = this.buf.slice(idx, endIdx);
            this.idx = endIdx;
        }
        return result;
    },
    end: function() {
        this.buf = null;
    }

};
module.exports = BufferStream;
