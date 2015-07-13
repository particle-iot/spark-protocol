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
