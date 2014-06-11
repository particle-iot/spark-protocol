/**
 * Interface for the Spark Core Handshake, v1
 * @constructor
 */
var Constructor = function () {

};

Constructor.prototype = {
    classname: "IHandshake",
    socket: null,

    /**
     * Tries to establish a secure remote connection using our handshake protocol
     * @param client
     * @param onSuccess
     * @param onFail
     */
    handshake: function (client, onSuccess, onFail) { throw new Error("Not yet implemented"); },

    _: null
};
module.exports = Constructor;
