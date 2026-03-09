/*\
title: $:/plugins/rimir/git-int/route
type: application/javascript
module-type: route

GET route for read-only git operations.
GET /api/git?op=log|show|stash-list|stash-show|stash-drop&title=...

Write operations (diff, snapshot, stash-push) use the POST route.

\*/

"use strict";

var utils = require("$:/plugins/rimir/git-int/git-utils");

exports.method = "GET";
exports.path = /^\/api\/git$/;

exports.handler = function(request, response, state) {
	var op = state.queryParameters.op;
	var title = state.queryParameters.title;

	// stash-list: use title to find the correct repo, fall back to wiki root
	if(op === "stash-list") {
		var stashCwd = $tw.boot.wikiPath;
		if(title) {
			var stashPaths = utils.resolveTiddlerPath(title);
			if(stashPaths) stashCwd = stashPaths.cwd;
		}
		handleStashList(response, stashCwd);
		return;
	}

	if(!title) {
		utils.sendJson(response, 400, {op: op, status: "error", error: "Missing 'title' parameter"});
		return;
	}

	var paths = utils.resolveTiddlerPath(title);
	if(!paths) {
		utils.sendJson(response, 404, {op: op, status: "error", error: "No file found for tiddler: " + title});
		return;
	}

	switch(op) {
		case "log":
			var count = parseInt(state.queryParameters.count) || 20;
			handleLog(response, paths.relPath, paths.cwd, count);
			break;
		case "show":
			var hash = state.queryParameters.hash;
			if(!hash || !/^[a-f0-9]{4,40}$/.test(hash)) {
				utils.sendJson(response, 400, {op: "show", status: "error", error: "Invalid or missing 'hash' parameter"});
				return;
			}
			handleShow(response, paths.relPath, paths.cwd, hash);
			break;
		case "stash-show":
			var index = state.queryParameters.index;
			if(!index || !/^\d+$/.test(index)) {
				utils.sendJson(response, 400, {op: "stash-show", status: "error", error: "Invalid or missing 'index' parameter"});
				return;
			}
			handleStashShow(response, paths.relPath, paths.cwd, index);
			break;
		case "stash-drop":
			var dropIndex = state.queryParameters.index;
			if(!dropIndex || !/^\d+$/.test(dropIndex)) {
				utils.sendJson(response, 400, {op: "stash-drop", status: "error", error: "Invalid or missing 'index' parameter"});
				return;
			}
			handleStashDrop(response, paths.cwd, dropIndex);
			break;
		default:
			utils.sendJson(response, 400, {op: op, status: "error", error: "Unknown op: " + op});
	}
};

function handleLog(response, relPath, cwd, count) {
	utils.execGit(["log", "--format=%h||%ai||%s", "-" + count, "--", relPath], cwd, function(err, stdout) {
		if(err) {
			utils.sendJson(response, 200, {op: "log", status: "error", error: err.message});
		} else {
			var entries = [];
			var lines = stdout.trim().split("\n");
			for(var i = 0; i < lines.length; i++) {
				if(!lines[i]) continue;
				var parts = lines[i].split("||");
				if(parts.length >= 3) {
					entries.push({
						hash: parts[0],
						date: parts[1],
						message: parts.slice(2).join("||")
					});
				}
			}
			utils.sendJson(response, 200, {op: "log", status: "ok", entries: entries});
		}
	});
}

function handleShow(response, relPath, cwd, hash) {
	utils.execGit(["show", hash + ":" + relPath], cwd, function(err, stdout) {
		if(err) {
			utils.sendJson(response, 200, {op: "show", status: "error", error: err.message});
		} else {
			utils.sendJson(response, 200, {
				op: "show", status: "ok",
				content: utils.parseTidBody(stdout),
				fields: utils.parseTidFields(stdout)
			});
		}
	});
}

function handleStashList(response, cwd) {
	utils.execGit(["stash", "list", "--format=%gd||%ai||%s"], cwd, function(err, stdout) {
		if(err) {
			utils.sendJson(response, 200, {op: "stash-list", status: "error", error: err.message});
		} else {
			var entries = [];
			var lines = stdout.trim().split("\n");
			for(var i = 0; i < lines.length; i++) {
				if(!lines[i]) continue;
				var parts = lines[i].split("||");
				if(parts.length >= 3) {
					var ref = parts[0];
					var match = ref.match(/\{(\d+)\}/);
					entries.push({
						index: match ? match[1] : String(i),
						ref: ref,
						date: parts[1],
						message: parts.slice(2).join("||")
					});
				}
			}
			utils.sendJson(response, 200, {op: "stash-list", status: "ok", entries: entries});
		}
	});
}

function handleStashShow(response, relPath, cwd, index) {
	var ref = "stash@{" + index + "}";
	utils.execGit(["show", ref + ":" + relPath], cwd, function(err, stdout) {
		if(err) {
			utils.sendJson(response, 200, {op: "stash-show", status: "error", error: err.message});
		} else {
			utils.sendJson(response, 200, {
				op: "stash-show", status: "ok",
				content: utils.parseTidBody(stdout),
				fields: utils.parseTidFields(stdout)
			});
		}
	});
}

function handleStashDrop(response, cwd, index) {
	var ref = "stash@{" + index + "}";
	utils.execGit(["stash", "drop", ref], cwd, function(err, stdout) {
		if(err) {
			utils.sendJson(response, 200, {op: "stash-drop", status: "error", error: err.message});
		} else {
			utils.sendJson(response, 200, {op: "stash-drop", status: "ok", output: stdout.trim()});
		}
	});
}
