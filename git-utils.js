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

// Cache: directory → git toplevel path (or null if not a repo)
var gitRootCache = {};

// Discover the git repo root for a given directory (synchronous, cached)
function findGitRoot(dir) {
	if(dir in gitRootCache) return gitRootCache[dir];
	try {
		var root = child_process.execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: dir,
			encoding: "utf8",
			timeout: 5000
		}).trim().replace(/\\/g, "/");
		gitRootCache[dir] = root;
		return root;
	} catch(e) {
		logger.log("No git repo found at " + dir + ": " + e.message);
		gitRootCache[dir] = null;
		return null;
	}
}

// Resolve a tiddler title to {absPath, relPath, cwd} or null
// cwd is the actual git repo root (supports nested repos)
exports.resolveTiddlerPath = function(title) {
	var fileInfo = $tw.boot.files[title];
	if(!fileInfo || !fileInfo.filepath) return null;
	var absPath = path.resolve($tw.boot.wikiTiddlersPath, fileInfo.filepath);
	var fileDir = path.dirname(absPath);
	var gitRoot = findGitRoot(fileDir);
	if(!gitRoot) return null;
	var normalizedGitRoot = path.resolve(gitRoot);
	var relPath = path.relative(normalizedGitRoot, absPath).replace(/\\/g, "/");
	return {absPath: absPath, relPath: relPath, cwd: normalizedGitRoot};
};

// Normalize line endings to \n (handles \r\n and bare \r)
function normalizeEol(raw) {
	return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// Parse .tid header fields into {name: value} object
exports.parseTidFields = function(raw) {
	var fields = {};
	var lines = normalizeEol(raw).split("\n");
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
// Returns empty string when no separator is found (header-only .tid files)
exports.parseTidBody = function(raw) {
	var idx = normalizeEol(raw).indexOf("\n\n");
	if(idx !== -1) return normalizeEol(raw).substring(idx + 2);
	return "";
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
