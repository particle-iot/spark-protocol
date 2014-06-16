
var DeviceServer = require('./DeviceServer.js');


//
//  Not the best way to deal with errors I'm told, but should be fine on a home server
//
process.on('uncaughtException', function (ex) {
    var stack = (ex && ex.stack) ? ex.stack : "";
    logger.error('Caught exception: ' + ex + ' stack: ' + stack);
});


var server = new DeviceServer();
server.start();

