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


var fs = require('fs');
var settings = require('../settings');
var Message = require('h5.coap').Message;
var Option = require('h5.coap/lib/Option.js');
var buffers = require('h5.buffers');
var hogan = require('hogan.js');
var logger = require('../lib/logger.js');

/**
 * Interface for the Spark Core Messages
 * @constructor
 */

var StaticClass;
module.exports = {
    classname: "Messages",
    _cache: {},
    basePath: settings.message_template_dir,


    //TODO: ADD
    //Describe (core-firmware)
    //Header: GET (T=CON, Code=0.01)
    //Uri-Path: "d"
    //
    //Core must respond as soon as possible with piggybacked Description response.

    Spec: {
        "Hello": { code: Message.Code.POST, uri: "h", type: Message.Type.NON, Response: "Hello" },
        "KeyChange": { code: Message.Code.PUT, uri: "k", type: Message.Type.CON, Response: "KeyChanged" },
        "UpdateBegin": { code: Message.Code.POST, uri: "u", type: Message.Type.CON, Response: "UpdateReady" },
        "Chunk": { code: Message.Code.POST, uri: "c?{{{crc}}}", type: Message.Type.CON, Response: "ChunkReceived" },
        "ChunkMissed": { code: Message.Code.GET, uri: "c", type: Message.Type.CON, Response: "ChunkMissedAck" },

        "UpdateDone": { code: Message.Code.PUT, uri: "u", type: Message.Type.CON, Response: null },
        "FunctionCall": { code: Message.Code.POST, uri: "f/{{name}}?{{{args}}}", type: Message.Type.CON, Response: "FunctionReturn" },
        "VariableRequest": { code: Message.Code.GET, uri: "v/{{name}}", type: Message.Type.CON, Response: "VariableValue" },

        "PrivateEvent": { code: Message.Code.POST, uri: "E/{{event_name}}", type: Message.Type.NON, Response: null },
        "PublicEvent": { code: Message.Code.POST, uri: "e/{{event_name}}", type: Message.Type.NON, Response: null },

        "Subscribe": { code: Message.Code.GET, uri: "e/{{event_name}}", type: Message.Type.CON, Response: null },
        "Describe": { code: Message.Code.GET, uri: "d", type: Message.Type.CON, Response: "DescribeReturn" },
        "GetTime": { code: Message.Code.GET, uri: "t", type: Message.Type.CON, Response: "GetTimeReturn" },
        "RaiseYourHand": { code: Message.Code.PUT, uri: "s", type: Message.Type.CON, Response: "RaiseYourHandReturn" },


        //  "PrivateSubscribe": { code: Message.Code.GET, uri: "E/{{event_name}}", type: Message.Type.NON, Response: null },

        "EventAck": { code: Message.Code.EMPTY, uri: null, type: Message.Type.ACK, Response: null },
        "EventSlowdown": { code: Message.Code.BAD_REQUEST, uri: null, type: Message.Type.ACK, Response: null },

        "SubscribeAck": { code: Message.Code.EMPTY, uri: null, type: Message.Type.ACK, Response: null },
        "SubscribeFail": { code: Message.Code.BAD_REQUEST, uri: null, type: Message.Type.ACK, Response: null },
        "GetTimeReturn": { code: Message.Code.CONTENT, type: Message.Type.ACK },
        "RaiseYourHandReturn": { code: Message.Code.CHANGED, type: Message.Type.ACK },
        "ChunkMissedAck": { code: Message.Code.EMPTY, type: Message.Type.ACK },
        "DescribeReturn": { code: Message.Code.CHANGED, type: Message.Type.NON },
        "KeyChanged": { code: Message.Code.CHANGED, type: Message.Type.NON },
        "UpdateReady": { code: Message.Code.CHANGED, type: Message.Type.NON },
        "ChunkReceived": { code: Message.Code.CHANGED, type: Message.Type.NON },
        "ChunkReceivedError": { code: Message.Code.BAD_REQUEST, type: Message.Type.NON },
        "FunctionReturn": { code: Message.Code.CHANGED, type: Message.Type.NON },
        "FunctionReturnError": { code: Message.Code.BAD_REQUEST, type: Message.Type.NON },
        "VariableValue": { code: Message.Code.CONTENT, type: Message.Type.ACK },
        "VariableValueError": { code: Message.Code.BAD_REQUEST, type: Message.Type.NON },
        "Ping": { code: Message.Code.EMPTY, type: Message.Type.CON },
        "PingAck": { code: Message.Code.EMPTY, uri: null, type: Message.Type.ACK, Response: null },
        "SocketPing": { code: Message.Code.EMPTY, type: Message.Type.NON }
    },

    /**
     * Maps CODE + URL to MessageNames as they appear in "Spec"
     */
    Routes: {
        //  "/u": StaticClass.Spec.UpdateBegin,
        //...
    },


    /**
     * does the special URL writing needed directly to the COAP message object,
     * since the URI requires non-text values
     *
     * @param showSignal
     * @returns {Function}
     */
    raiseYourHandUrlGenerator: function (showSignal) {
        return function (msg) {
            var b = new Buffer(1);
            b.writeUInt8(showSignal ? 1 : 0, 0);

            msg.addOption(new Option(Message.Option.URI_PATH, new Buffer("s")));
            msg.addOption(new Option(Message.Option.URI_QUERY, b));
            return msg;
        };
    },


    getRouteKey: function (code, path) {
        var uri = code + path;

        //find the slash.
        var idx = uri.indexOf('/');

        //this assumes all the messages are one character for now.
        //if we wanted to change this, we'd need to find the first non message char, "/" or "?",
        //or use the real coap parsing stuff
        return uri.substr(0, idx + 2);
    },


    getRequestType: function (msg) {
        var uri = StaticClass.getRouteKey(msg.getCode(), msg.getUriPath());
        return StaticClass.Routes[uri];
    },

    getResponseType: function (name) {
        var spec = StaticClass.Spec[name];
        return (spec) ? spec.Response : null;
    },

    statusIsOkay: function (msg) {
        return (msg.getCode() < Message.Code.BAD_REQUEST);
    },


    //    DataTypes: {
    //1: BOOLEAN (false=0, true=1)
    //2: INTEGER (int32)
    //4: OCTET STRING (arbitrary bytes)
    //9: REAL (double)
    //    },

    _started: false,
    init: function () {
        if (StaticClass._started) {
            return;
        }

        logger.log("static class init!");

        for (var p in StaticClass.Spec) {
            var obj = StaticClass.Spec[p];

            if (obj && obj.uri && (obj.uri.indexOf("{") >= 0)) {
                obj.template = hogan.compile(obj.uri);
            }

            //GET/u
            //PUT/u
            //... etc.
            if (obj.uri) {
                //see what it looks like without params
                var uri = (obj.template) ? obj.template.render({}) : obj.uri;
                var u = StaticClass.getRouteKey(obj.code, "/" + uri);

                this.Routes[u] = p;
            }


        }
        StaticClass._started = true;
    },


    /**
     *
     * @param name
     * @param id - must be an unsigned 16 bit integer
     * @param params
     * @param data
     * @param token - helps us associate responses w/ requests
     * @param onError
     * @returns {*}
     */
    wrap: function (name, id, params, data, token, onError) {
        var spec = StaticClass.Spec[name];
        if (!spec) {
            if (onError) {
                onError("Unknown Message Type");
            }
            return null;
        }

        // Setup the Message
        var msg = new Message();

        // Format our url
        var uri = spec.uri;
        if (params && params._writeCoapUri) {
            // for our messages that have nitty gritty urls that require raw bytes and no strings.
            msg = params._writeCoapUri(msg);
            uri = null;
        }
        else if (params && spec.template) {
            uri = spec.template.render(params);
        }

        if (uri) {
            msg.setUri(uri);
        }
        msg.setId(id);

        if (token !== null) {
            if (!Buffer.isBuffer(token)) {
                var buf = new Buffer(1);
                buf[0] = token;
                token = buf;
            }
            msg.setToken(token);
        }
        msg.setCode(spec.code);
        msg.setType(spec.type);

        // Set our payload
        if (data) {
            msg.setPayload(data);
        }

        if (params && params._raw) {
            params._raw(msg);
        }

        return msg.toBuffer();
    },

    unwrap: function (data) {
        try {
            if (data) {
                return Message.fromBuffer(data);
            }
        }
        catch (ex) {
            logger.error("Coap Error: " + ex);
        }

        return null;
    },


//http://en.wikipedia.org/wiki/X.690
//=== TYPES: SUBSET OF ASN.1 TAGS ===
//
//1: BOOLEAN (false=0, true=1)
//2: INTEGER (int32)
//4: OCTET STRING (arbitrary bytes)
//5: NULL (void for return value only)
//9: REAL (double)

    /**
     * Translates the integer variable type enum to user friendly string types
     * @param varState
     * @returns {*}
     * @constructor
     */
    TranslateIntTypes: function (varState) {
        if (!varState) {
            return varState;
        }

        for (var varName in varState) {
            if (!varState.hasOwnProperty(varName)) {
                continue;
            }

            var intType = varState[varName];
            if (typeof intType === "number") {
                var str = StaticClass.getNameFromTypeInt(intType);

                if (str != null) {
                    varState[varName] = str;
                }
            }
        }
        return varState;
    },

    getNameFromTypeInt: function (typeInt) {
        switch (typeInt) {
            case 1:
                return "bool";
            case 2:
                return "int32";
            case 4:
                return "string";
            case 5:
                return "null";
            case 9:
                return "double";

            default:
                logger.error("asked for unknown type: " + typeInt);
                return null;
        }
    },

    TryFromBinary: function (buf, name) {
        var result = null;
        try {
            result = StaticClass.FromBinary(buf, name);
        }
        catch (ex) {

        }
        return result;
    },

    FromBinary: function (buf, name) {

        //logger.log('converting a ' + name + ' FromBinary input was ' + buf);

        if (!Buffer.isBuffer(buf)) {
            buf = new Buffer(buf);
        }

        var r = new buffers.BufferReader(buf);
        var v;

        switch (name) {
            case "bool":
                v = (r.shiftByte() != 0);
                break;
            case "crc":
                v = r.shiftUInt32();
                break;
            case "uint32":
                v = r.shiftUInt32();
                break;
            case "uint16":
                v = r.shiftUInt16();
                break;

            case "int32":
            case "number":
                v = r.shiftInt32();
                break;
            case "float":
                v = r.shiftFloat();
                break;
            case "double":
                v = r.shiftDouble(true);    //doubles on the core are little-endian
                break;
            case "buffer":
                v = buf;
                break;
            case "string":
            default:
                v = buf.toString();
                break;
        }
        //logger.log('FromBinary val is: "', buf.toString('hex'), '" type is ', name, ' converted to ', v);
        return v;
    },

    ToBinary: function (val, name, b) {
        name = name || (typeof val);

//        if ((name === "number") && (val % 1 != 0)) {
//            name = "double";
//        }

        b = b || new buffers.BufferBuilder();

        switch (name) {

            case "uint32":
            case "crc":
                b.pushUInt32(val);
                break;
            case "int32":
                b.pushInt32(val);
                break;
            case "number":
            //b.pushInt32(val);
            //break;
            case "double":
                b.pushDouble(val);
                break;
            case "buffer":
                b.pushBuffer(val);
                break;
            case "string":
            default:
                b.pushString(val || "");
                break;
        }

        //logger.log('converted a ' + name + ' ' + val + ' ToBinary output was ' + b.toBuffer().toString('hex'));
        return b.toBuffer();
    },

    buildArguments: function (obj, args) {
        try {
            var b = new buffers.BufferBuilder();
            for (var i = 0; i < args.length; i++) {
                if (i > 0) {
                    StaticClass.ToBinary("&", "string", b);
                }

                var p = args[i];
                if (!p) {
                    continue;
                }

                var name = p[0] || Object.keys(obj)[0]; //or... just grab the first key.
                var type = p[1];
                var val = obj[name];

                StaticClass.ToBinary(val, type, b);
            }
            //logger.log('function arguments were ', b.toBuffer().toString('hex'));
            return b.toBuffer();
        }
        catch (ex) {
            logger.error("buildArguments: ", ex);
        }
        return null;
    },
    parseArguments: function (args, desc) {
        try {
            if (!args || (args.length != desc.length)) {
                return null;
            }

            var results = [];
            for (var i = 0; i < desc.length; i++) {
                var p = desc[i];
                if (!p) {
                    continue;
                }

                //desc -> [ [ name, type ], ... ]
                var type = p[1];
                var val = (i < args.length) ? args[i] : null;

                results.push(
                    StaticClass.FromBinary(new Buffer(val, 'binary'), type)
                );
            }

            return results;
        }
        catch (ex) {
            logger.error("parseArguments: ", ex);
        }

        return null;
    },


    foo: null
};
StaticClass = module.exports;
StaticClass.init();
//module.exports = StaticClass;
