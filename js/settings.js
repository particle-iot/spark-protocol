var path = require('path');

module.exports = {
    PORT: 5683,
    HOST: "localhost",


    /**
     * Your server crypto keys!
     */
    serverKeyFile: "default_key.pem",
    serverKeyPassFile: null,
    serverKeyPassEnvVar: null,

    coreKeysDir: path.join(__dirname, "data"),

    /**
     * How high do our counters go before we wrap around to 0?
     * (CoAP maxes out at a 16 bit int)
     */
    message_counter_max: Math.pow(2, 16),

    /**
     * How big can our tokens be in CoAP messages?
     */
    message_token_max: 255,
};