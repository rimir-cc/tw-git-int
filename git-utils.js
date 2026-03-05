/*\
title: $:/plugins/rimir/git-int/git-utils
type: application/javascript
module-type: library

Shared utility functions for the git-int plugin.

\*/

"use strict";

var child_process = require("child_process");
var path = require("path");

var logger = new $tw.utils.Logger("git-int", {colour: "blue"});

// Resolve a tiddler title to {absPath, relPath, cwd} or null
exports.resolveTiddlerPath = function(title) {
	var fileInfo = $tw.boot.files[title];
	if(!fileInfo || !fileInfo.filepath) return null;
	var absPath = path.resolve($tw.boot.wikiTiddlersPath, fileInfo.filepath);
	var relPath = path.relative($tw.boot.wikiPath, absPath).replace(/\\/g, "/");
	return {absPath: absPath, relPath: relPath, cwd: $tw.boot.wikiPath};
};

// Parse .tid header fields into {name: value} object
exports.parseTidFields = function(raw) {
	var fields = {};
	var lines = raw.split(/\r?\n/);
	for(var i = 0; i < lines.length; i++) {
		if(lines[i] === "") break;
		var colonIdx = lines[i].indexOf(": ");
		if(colonIdx !== -1) {
			fields[lines[i].substring(0, colonIdx)] = lines[i].substring(colonIdx + 2);
		}
	}
	return fields;
};

// Parse .tid body: everything after the first blank line
exports.parseTidBody = function(raw) {
	var idx = raw.indexOf("\n\n");
	if(idx !== -1) return raw.substring(idx + 2);
	idx = raw.indexOf("\r\n\r\n");
	if(idx !== -1) return raw.substring(idx + 4);
	return raw;
};

// Execute a git command safely with array args
exports.execGit = function(args, cwd, callback) {
	child_process.execFile("git", args, {cwd: cwd, maxBuffer: 1024 * 1024}, function(err, stdout, stderr) {
		if(err) {
			logger.log("git " + args.join(" ") + " failed:", err.message);
			callback(err, (stdout || "") + (stderr || ""));
		} else {
			callback(null, stdout || "");
		}
	});
};

// Send a JSON response
exports.sendJson = function(response, statusCode, data) {
	response.writeHead(statusCode, {"Content-Type": "application/json"});
	response.end(JSON.stringify(data));
};
