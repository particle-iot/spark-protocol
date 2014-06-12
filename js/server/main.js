// settings block
//var utilities = require("../lib/utilities.js");
var settings = require('../settings.js');
var CryptoLib = require('../lib/ICrypto.js');
var SparkCore = require('../clients/SparkCore.js');
var EventPublisher = require('../lib/EventPublisher.js');
var logger = require('../lib/logger.js');
var crypto = require('crypto');
var ursa = require('ursa');
var when = require('when');
var path = require('path');
var net = require('net');
var fs = require('fs');

//
//  Create our basic socket handler
//

var connId = 0,
    _cores = {},
    server = net.createServer(function (socket) {
        process.nextTick(function () {
            try {
                var key = "_" + connId++;
                logger.log("Connection from: " + socket.remoteAddress + ", connId: " + connId);

                var core = new SparkCore();
                core.socket = socket;
                core.startupProtocol();

                //TODO: expose to API


                _cores[key] = core;
                core.on('disconnect', function (msg) {
                    logger.log("Session ended for " + connId);
                    delete _cores[key];
                });
            }
            catch (ex) {
                logger.error("core startup failed " + ex);
            }
        });
    });
global.cores = _cores;
global.publisher = new EventPublisher();

server.on('error', function () {
    logger.error("something blew up ", arguments);
});



//
//  Load the provided key, or generate one
//
if (!fs.existsSync(settings.serverKeyFile)) {
    var keys = ursa.generatePrivateKey();


    var extIdx = settings.serverKeyFile.lastIndexOf(".")
    var derFilename = settings.serverKeyFile.substring(0, extIdx) + ".der";
    var pubPemFilename = settings.serverKeyFile.substring(0, extIdx) + ".pub.pem";

    fs.writeFileSync(settings.serverKeyFile, keys.toPrivatePem('binary'));
    fs.writeFileSync(pubPemFilename, keys.toPublicPem('binary'));

    //DER FORMATTED KEY for the core hardware
    //TODO: fs.writeFileSync(derFilename, keys.toPrivatePem('binary'));
}


//
//  Load our server key
//
CryptoLib.loadServerKeys(
    settings.serverKeyFile,
    settings.serverKeyPassFile,
    settings.serverKeyPassEnvVar
);

//
//  Wait for the keys to be ready, then start accepting connections
//

server.listen(settings.PORT, function () {
    logger.log("server started", { host: settings.HOST, port: settings.PORT });
});



//
//  Not the best way to deal with errors I'm told, but should be fine on a home server
//
process.on('uncaughtException', function (ex) {
    var stack = (ex && ex.stack) ? ex.stack : "";
    logger.error('Caught exception: ' + ex + ' stack: ' + stack);
});
