
//serial communication
var DMX = require('dmxhost');
var coreaudio = require('node-core-audio');
var ft = require('fourier-transform');

//web sockets
var express = require('express.io');
var app = express();

var applySoundInput = true;

//-----------OPTIONS--------------------------------

var countDevices = 9; // number of spots

// DMX
DMX.log = true;
//DMX.device = "\\.\COM8";
DMX.device = "COM4";
DMX.relayResponseTimeout = 1000;
DMX.relayPath = './node_modules/dmxhost/dmxhost-serial-relay.py';

//----------------------------------------------------


var allDevices = [];
for (var i = 0; i < countDevices; i++) {
	allDevices.push(i);
}

var DMXManager = function () {
	//initialize and configure DMX Module
	this.initialize = function () {

		DMX.spawn(null, function (error) {
			if (error) {
				console.log("--------DMX BRIDGE COULD NOT BE INITIALIZED -----------");
				console.log("Error:", error);
				console.log("-------------------------------------------------------");
				return;
			}
		});
	};

	//send frame
	//var rgbw = new Array(16 * 4);
	//var frameCounter = 0;

	this.send = function (frame) {
		DMX.ready() && DMX.send({
			data : frame
		});
	};
};

//Create a core audio engine
var engine = coreaudio.createNewAudioEngine();
//engine.setOptions({ inputChannels: 1, outputChannels: 2, interleaved: true });
engine.setOptions({
	inputChannels : 1,
	interleaved : true
});

//initialize dmx serial manager
var dmxManager = new DMXManager();
dmxManager.initialize();

var config = {
	"thresholdRMin" : 0,
	"thresholdRMax" : 50,
	"thresholdGMin" : 51,
	"thresholdGMax" : 100,
	"thresholdBMin" : 101,
	"thresholdBMax" : 512,
	"thresholdAmpMin" : 0,
	"thresholdAmpMax" : 512,
	"globalBrightness" : 1
}

// Outputs sine waves panning left & right while showing microphone input on screen
setTimeout(function () {

	var arr = [];
	var high = 0;
	var med = 0;
	var low = 0;
	val_low = 0;
	val_med = 0;
	val_high = 0;

	//thresholds for fft array (512 values), for calculation of r g b values


	//max amplitude
	var maxAmplitude = 1;

	
	//read buffer every 30ms
	setInterval(function () {
		//get soundbuffer
		arr = engine.read();

		//put soundbuffer to fft analysis and get array with 512 values
		var spectrum = ft(arr);
		app.io.broadcast('spectrum', spectrum);

		if (applySoundInput) {

			high = 0;
			med = 0;
			low = 0;

			var maxValue = 0;
			var sumValue = 0;
			var length = spectrum.length;

			for (var i = config.thresholdRMin; i < config.thresholdRMax; i++) {
				low += spectrum[i];
			}
			for (var i = config.thresholdGMin; i < config.thresholdGMax; i++) {
				med += spectrum[i];
			}
			for (var i = config.thresholdBMin; i < config.thresholdBMax; i++) {
				high += spectrum[i];
			}
			for (var i = config.thresholdAmpMin; i < config.thresholdAmpMax; i++) {
				maxValue = maxValue < spectrum[i] ? spectrum[i] : maxValue;
				sumValue += spectrum[i];
			}

			//slowly lower maxAmplitude
			maxAmplitude *= 0.98;

			//update maxAmplitude
			maxAmplitude = maxAmplitude < sumValue ? sumValue : maxAmplitude;

			//amplify
			var newval_low = low * 1000;
			var newval_med = med * 1000;
			var newval_high = high * 1000;

			//medianize
			val_low = Math.min(220, Math.floor((val_low * 0.9) + (0.1 * newval_low)));
			val_med = Math.min(220, Math.floor((val_med * 0.9) + (0.1 * newval_med)));
			val_high = Math.min(220, Math.floor((val_high * 0.9) + (0.1 * newval_high)));

			//console.log("low:"+val_low+" med:"+val_med+" hight:"+val_high)

			devicesToUpdate = Math.round((sumValue / maxAmplitude) * countDevices);

			var devices = [];
			for (var i = 0; i < devicesToUpdate; i++) {
				devices.push(i);
			}
			setColor(val_low, val_med, val_high, 0, devices, true)
		}
	}, 30)

	var oldcolors = [];
	for (var i = 0; i < countDevices * 4; i++) {
		oldcolors.push(0);
	}
	
	
	/*
	* sets the colors
	* r,g,b  - number colors 0-255
	* devices - number of devices to update 0 - x in bus are updated
	* disableothers - boolean tells if others are set to black
	*/
	
	var setColor = function (r, g, b, w, devices, disableothers) {
		
		r = Math.floor(r * config.globalBrightness);
		g = Math.floor(g * config.globalBrightness);
		b = Math.floor(b * config.globalBrightness);
		w = Math.floor(w * config.globalBrightness);

		var colors = [];
		for (var i = 0; i < countDevices; i++) {
			if (devices.indexOf(i) > -1) {
				colors.push(r);
				colors.push(g);
				colors.push(b);
				colors.push(w);
			} else if (disableothers) {
				colors.push(1);
				colors.push(1);
				colors.push(1);
				colors.push(1);
			}
		}

		for (var i = 0; i < countDevices * 4; i++) {
			colors[i] = Math.floor(oldcolors[i] * 0.1 + colors[i] * 0.9);
		}
		oldcolors = colors;
		dmxManager.send(colors);
		app.io.broadcast('colors', colors);
	}

	
	/*
	* Communication with frontend
	*/
	
	app.http().io();
	app.use(express.static(__dirname + '/interface'));

	app.io.route('ranges', function (req) {
		console.log("ranges");
		console.log(req.data.minr)
		config.thresholdRMin = req.data.minr;
		config.thresholdRMax = req.data.maxr;
		config.thresholdGMin = req.data.ming;
		config.thresholdGMax = req.data.maxg;
		config.thresholdBMin = req.data.minb;
		config.thresholdBMax = req.data.maxb;
		config.thresholdAmpMax = req.data.maxamp;
		config.thresholdAmpMin = req.data.minamp;

	})

	app.io.route('setColor', function (req) {
		setColor(req.data.r, req.data.g, req.data.b, req.data.w, allDevices)
	})

	app.io.route('setBrightness', function (req) {
		config.globalBrightness = req.data.brightness;
	})

	app.io.route('stop', function (req) {
		console.log("stop");
		applySoundInput = false;
	})

	app.io.route('start', function (req) {
		console.log("start");
		applySoundInput = true;
	})

	var server = app.listen(3001, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('tower app listening at http://%s:%s', host, port);
		});

}, DMX.relayResponseTimeout);