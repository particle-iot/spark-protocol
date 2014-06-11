var extend = require("xtend");

var IFlasher = function(options) { };
IFlasher.prototype = {
    client: null,
    stage: 0,

    startFlash: function() { },
    _nextStep: function(data) {},
    foo: null
};
module.exports = IFlasher;