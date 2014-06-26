var settings = require('../settings.js');
var CryptoLib = require('../lib/ICrypto.js');
var SparkCore = require('../clients/SparkCore.js');
var EventPublisher = require('../lib/EventPublisher.js');
var utilities = require('../lib/utilities.js');
var logger = require('../lib/logger.js');
var crypto = require('crypto');
var ursa = require('ursa');
var when = require('when');
var path = require('path');
var net = require('net');
var fs = require('fs');


var DeviceServer = function (options) {
    this.options = options;
    this._allCoresByID = {};
    this.init();
};

DeviceServer.prototype = {
    _allCoresByID: null,


    init: function () {
        this.loadCoreData();
    },


    loadCoreData: function (coreDir) {
        var coresByID = {};

        var files = fs.readdirSync(settings.coreKeysDir);
        for (var i = 0; i < files.length; i++) {
            var filename = files[i];
            var fullPath = path.join(settings.coreKeysDir, filename);
            var ext = utilities.getFilenameExt(filename) ;

            if (ext == ".pem") {
                var id = utilities.filenameNoExt(filename);
                coresByID[id] = coresByID[id] || {};
            }
            else if (ext == ".json") {
                try {
                    var contents = fs.readFileSync(fullPath);
                    var core = JSON.parse(contents);
                    coresByID[core.coreID] = core;
                }
                catch (ex) {
                    logger.error("Error loading core file " + filename);
                }
            }
        }

        this._allCoresByID = coresByID;
    },

    getCore: function(coreid) {
        return this._allCoresByID[coreid];
    },

    getAllCores: function () {
        return this._allCoresByID;
    },


//id: core.coreID,
//name: core.name || null,
//last_app: core.last_flashed_app_name || null,
//last_heard: null


    start: function () {

        //TODO: something much better than this.
        if (this.options) {
            if (this.options.coreKeysDir) {
                settings.coreKeysDir = this.options.coreKeysDir;
            }
        }
        global.settings = settings;

        //
        //  Create our basic socket handler
        //

        var that = this,
            connId = 0,
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
                        core.on('ready', function() {
                            logger.log("Core online!");
                            var coreid = this.getHexCoreID();
                            that._allCoresByID[coreid] = core;
                        });
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
            console.warn("Creating NEW server key");
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
        console.info("Loading server key from " + settings.serverKeyFile);
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


    }

}
;
module.exports = DeviceServer;