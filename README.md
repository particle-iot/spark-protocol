spark-protocol
================

  Node.JS module for hosting direct encrypted CoAP socket connections!  Checkout the local [spark-server](https://github.com/spark/spark-server)

<pre>
                          __      __        __              __
   _________  ____ ______/ /__   / /___  __/ /_  ___  _____/ /
  / ___/ __ \/ __ `/ ___/ //_/  / __/ / / / __ \/ _ \/ ___/ / 
 (__  ) /_/ / /_/ / /  / , |   / /_/ /_/ / /_/ /  __(__  )_/  
/____/ .___/\__,_/_/  /_/|_|   \__/\__,_/_.___/\___/____(_)   
    /_/                                                       
</pre>


What do I need to know?
========================

  This module knows how to talk encrypted CoAP.  It's really good at talking with Spark Cores, and any other hardware that uses this protocol.  You'll need a server key to use and load onto your devices.  You'll also need to grab any public keys for your connected devices and store them somewhere this module can find them.  The public server key stored on the device can also store an IP address or DNS name for your server, so make sure you load that onto your server key when copying it to your device.  The server will also generate a default key if you don't have one when it starts up.

What code modules should I start with?
============================================

There's lots of fun stuff here, but in particular you should know about the "SparkCore" ( https://github.com/spark/spark-protocol/blob/master/js/clients/SparkCore.js ) , and "DeviceServer" ( https://github.com/spark/spark-protocol/blob/master/js/server/DeviceServer.js ) modules.  The "DeviceServer" module runs a server that creates "SparkCore" objects, which represent your connected devices.


How do I start a server in code?
---------------------------

```
var DeviceServer = require("spark-protocol").DeviceServer;
var server = new DeviceServer({
    coreKeysDir: "/path/to/your/public_device_keys"
});
global.server = server;
server.start();

```


How do I get my key / ip address on my core?
================================================

1.) Figure out your IP address, for now lets say it's 192.168.1.10

2.) Make sure you have the Spark-CLI (https://github.com/spark/spark-cli) installed

3.) Connect your Spark Core to your computer in listening mode (http://docs.spark.io/connect/#appendix-dfu-mode-device-firmware-upgrade)

4.) Load the server key and include your IP address / dns address:

```
spark keys server server_public_key.der your_ip_address
spark keys server server_public_key.der 192.168.1.10
```

5.) That's it!


Where's the API / webserver stuff, this is just a TCP server?
===========================================================================

  Oh, you want the Spark-Server module here: https://github.com/spark/spark-server  :)
  
  


