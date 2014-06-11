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
