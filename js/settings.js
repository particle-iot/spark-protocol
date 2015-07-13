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

    verboseProtocol: false
};