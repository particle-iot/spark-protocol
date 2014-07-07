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



//
//  Not the best way to deal with errors I'm told, but should be fine on a home server
//
process.on('uncaughtException', function (ex) {
    var stack = (ex && ex.stack) ? ex.stack : "";
    logger.error('Caught exception: ' + ex + ' stack: ' + stack);
});


var DeviceServer = require('./DeviceServer.js');
var server = new DeviceServer();
server.start();

