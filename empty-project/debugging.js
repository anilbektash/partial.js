var fork = require('child_process').fork;
var fs = require('fs');
var path = require('path');
var directory = process.cwd();
var utils = require('partial.js/utils');
var Walker = require('partial.js/backup').Walker;

var directories = [directory + '/controllers', directory + '/definitions', directory + '/modules'];
var files = {};
var force = false;
var changes = [];
var app = null;
var status = 0;
var async = new utils.Async();
var pid = '';
var pidInterval = null;
var prefix = '------------> ';
var walker = new Walker();
var isLoaded = false;

walker.onFilter = function(path) {
	return path.indexOf('.js') !== -1;
};

walker.onComplete = function() {

	var self = this;

	fs.readdir(directory, function(err, arr) {

		var length = arr.length;

		for (var i = 0; i < length; i++) {
			var name = arr[i];

			if (name === 'debugging.js' || name === 'keepalive.js')
				continue;

			if (name === 'config-debug' || name === 'config-release' || name.indexOf('.js') !== -1)
				self.file.push(name);
		}

		length = self.file.length;

		for (var i = 0; i < length; i++) {
			var name = self.file[i];
			if (!files[name]) {
				files[name] = isLoaded ? 0 : null;
				console.log(files[name], name);
			}
		}

		refresh();
	});
};

function refresh() {

	 var filenames = Object.keys(files);
	 var length = filenames.length;

	 for (var i = 0; i < length; i++) {

	 	var filename = filenames[i];
	 	(function(filename) {

	 		async.await(function(next) {

		 		fs.stat(filename, function(err, stat) {

		 			if (!err) {
			 			var ticks = stat.mtime.getTime();

			 			if (files[filename] !== null && files[filename] !== ticks) {
			 				changes.push(prefix + filename.replace(directory, '') +  (files[filename] === 0 ? ' (added)' : ' (modified)'));
			 				force = true;
			 			}

		 				files[filename] = ticks;
			 		}
			 		else {
			 			delete files[filename];
			 			changes.push(prefix + filename.replace(directory, '') + ' (removed)');
			 			force = true;
			 		}

			 		next();
		 		});
	 		});

	 	})(filename);
	 }

	 async.complete(function() {

	 	isLoaded = true;
	 	setTimeout(refresh_directory, 2000);

	 	if (status !== 1)
	 		return;

	 	if (!force)
	 		return;

	 	restart();

		var length = changes.length;

	 	for (var i = 0; i < length; i++)
	 		console.log(changes[i]);

	 	changes = [];
	 	force = false;
	 });

}

function refresh_directory() {
	walker.reset();
	walker.walk(directories);
}

function restart() {

	if (app !== null) {
		try
		{
			process.kill(app.pid);
		} catch (err) {}
		app = null;
	}

	app = fork(path.join(directory, 'index.js'));

	app.on('message', function(msg) {
		if (msg.substring(0, 5) === 'name:') {
			process.title = 'debug: ' + msg.substring(6);
			return;
		}
	});

	app.on('exit', function() {

		if (status !== 255)
			return;

		app = null;
	});

	status = 1;
}

process.on('SIGTERM', function() {
	fs.unlink(pid, noop);

	if (app === null) {
		process.exit(0);
		return;
	}

	process.kill(app.pid);
	app = null;
	process.exit(0);
});

process.on('SIGINT', function() {
	fs.unlink(pid, noop);

	if (app === null) {
		process.exit(0);
		return;
	}

	process.kill(app.pid);
	app = null;
	process.exit(0);
});

process.on('exit', function() {
	fs.unlink(pid, noop);

	if (app === null)
		return;

	process.kill(app.pid);
	app = null;
});

function noop() {}

if (process.pid > 0) {
	console.log(prefix + 'PID: ' + process.pid);
	pid = path.join(directory, 'debugging.pid');
	fs.writeFileSync(pid, process.pid);

	pidInterval = setInterval(function() {

		fs.exists(pid, function(exist) {
			if (exist)
				return;

			fs.unlink(pid, noop);

			if (app !== null)
				process.kill(app.pid);

			process.exit(0);
		});

	}, 2000);
}

restart();
refresh_directory();