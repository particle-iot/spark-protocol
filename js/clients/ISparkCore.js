/**
 * Interface for the Spark Core module
 * @constructor
 */
var Constructor = function () {

};

Constructor.prototype = {
    classname: "ISparkCore",
    socket: null,

    startupProtocol: function () {
        this.handshake(this.hello, this.disconnect);
    },

    handshake: function (onSuccess, onFail) { throw new Error("Not yet implemented"); },
    hello: function (onSuccess, onFail) { throw new Error("Not yet implemented"); },
    disconnect: function () { throw new Error("Not yet implemented"); },


    /**
     * Connect to API
     */
    onApiMessage: function(sender, msg) { throw new Error("Not yet implemented"); },

    /**
     * Connect to API
     */
    sendApiResponse: function(sender, msg) { throw new Error("Not yet implemented"); },


    foo: null
};
module.exports = Constructor;
