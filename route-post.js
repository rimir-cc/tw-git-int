/*\
title: $:/plugins/rimir/git-int/route-post
type: application/javascript
module-type: route

POST route for git operations that need current draft content from the browser.
The browser sends all draft fields since $tw.wiki on the server may not have
the latest unsaved edits. The server reconstructs the .tid file from the fields.

POST /api/git  {op, title, message?, hash?, index?, fields: {title, text, tags, ...}}

\*/

"use strict";

var fs = require("fs");
var utils = require("$:/plugins/rimir/git-int/git-utils");

exports.method = "POST";
exports.path = /^\/api\/git$/;

exports.handler = function(request, response, state) {
	var data;
	try {
		data = JSON.parse(state.data);
	} catch(e) {
		utils.sendJson(response, 400, {status: "error", error: "Invalid JSON body"});
		return;
	}

	var op = data.op;
	var title = data.title;
	var draftFields = data.fields;
	var message = data.message;

	if(!title) {
		utils.sendJson(response, 400, {op: op, status: "error", error: "Missing 'title'"});
		return;
	}

	var paths = utils.resolveTiddlerPath(title);
	if(!paths) {
		utils.sendJson(response, 404, {op: op, status: "error", error: "No file found for tiddler: " + title});
		return;
	}

	switch(op) {
		case "diff":
			handleDiffWithDraft(response, paths, draftFields, data.hash, data.index);
			break;
		case "snapshot":
			var commitMsg = message || ("Snapshot: " + title);
			writeFieldsToFile(paths.absPath, draftFields);
			handleSnapshot(response, paths.relPath, paths.cwd, commitMsg);
			break;
		case "stash-push":
			var stashMsg = message || ("Stash: " + title);
			writeFieldsToFile(paths.absPath, draftFields);
			handleStashPush(response, paths.relPath, paths.cwd, stashMsg);
			break;
		default:
			utils.sendJson(response, 400, {op: op, status: "error", error: "POST not supported for op: " + op});
	}
};

// Parse field order from an existing .tid file
function getFieldOrder(fileContent) {
	var order = [];
	var lines = fileContent.split(/\r?\n/);
	for(var i = 0; i < lines.length; i++) {
		if(lines[i] === "") break;
		var match = lines[i].match(/^([^:]+):/);
		if(match) {
			order.push(match[1]);
		}
	}
	return order;
}

// Reconstruct a .tid file preserving the original field order
function buildTidContent(fields, originalContent) {
	if(!fields) return null;
	var text = fields.text || "";

	var order = originalContent ? getFieldOrder(originalContent) : [];

	// Existing fields first (in original order), then new fields (sorted)
	var written = {};
	var lines = [];
	for(var i = 0; i < order.length; i++) {
		var name = order[i];
		if(name !== "text" && name in fields) {
			lines.push(name + ": " + fields[name]);
			written[name] = true;
		}
	}
	var newFields = [];
	for(var name in fields) {
		if(name !== "text" && !written[name]) {
			newFields.push(name);
		}
	}
	newFields.sort();
	for(var j = 0; j < newFields.length; j++) {
		lines.push(newFields[j] + ": " + fields[newFields[j]]);
	}

	return lines.join("\n") + "\n\n" + text;
}

function writeFieldsToFile(absPath, draftFields) {
	if(!draftFields) return;
	var originalContent = null;
	try { originalContent = fs.readFileSync(absPath, "utf8"); } catch(e) {}
	var content = buildTidContent(draftFields, originalContent);
	if(content !== null) {
		fs.writeFileSync(absPath, content, "utf8");
	}
}

function handleDiffWithDraft(response, paths, draftFields, hash, stashIndex) {
	// Determine git ref: specific commit, stash, or HEAD
	var ref, diffLabel;
	if(hash && /^[a-f0-9]{4,40}$/.test(hash)) {
		ref = hash + ":" + paths.relPath;
		diffLabel = "Draft vs. commit " + hash;
	} else if(stashIndex !== undefined && /^\d+$/.test(stashIndex)) {
		ref = "stash@{" + stashIndex + "}:" + paths.relPath;
		diffLabel = "Draft vs. stash@{" + stashIndex + "}";
	} else {
		ref = "HEAD:" + paths.relPath;
		diffLabel = "Draft vs. HEAD";
	}
	utils.execGit(["show", ref], paths.cwd, function(err, stdout) {
		var committedFields = {};
		if(!err) {
			committedFields = utils.parseTidFields(stdout);
			committedFields.text = utils.parseTidBody(stdout);
		}
		var currentFields = {};
		if(draftFields) {
			for(var k in draftFields) {
				currentFields[k] = draftFields[k];
			}
			if(!("text" in currentFields)) currentFields.text = "";
		} else {
			try {
				var diskContent = fs.readFileSync(paths.absPath, "utf8");
				currentFields = utils.parseTidFields(diskContent);
				currentFields.text = utils.parseTidBody(diskContent);
			} catch(e) {
				currentFields.text = "";
			}
		}
		var fieldChanges = buildFieldChanges(committedFields, currentFields);
		var result = {
			op: "diff", status: "ok",
			fieldChanges: fieldChanges,
			hasDiff: fieldChanges.length > 0,
			diffLabel: diffLabel
		};
		if(hash) result.hash = hash;
		if(stashIndex !== undefined) result.index = stashIndex;
		utils.sendJson(response, 200, result);
	});
}

// Compare two field sets, return array of changes
var SKIP_FIELDS = {modified: true, bag: true, revision: true};

function buildFieldChanges(oldFields, newFields) {
	var changes = [];
	var allKeys = {};
	var k;
	for(k in oldFields) allKeys[k] = true;
	for(k in newFields) allKeys[k] = true;
	var keys = Object.keys(allKeys).sort();
	for(var i = 0; i < keys.length; i++) {
		k = keys[i];
		if(SKIP_FIELDS[k]) continue;
		var oldVal = oldFields[k];
		var newVal = newFields[k];
		if(oldVal === undefined && newVal !== undefined) {
			changes.push({field: k, type: "added", oldVal: "", newVal: newVal});
		} else if(oldVal !== undefined && newVal === undefined) {
			changes.push({field: k, type: "removed", oldVal: oldVal, newVal: ""});
		} else if(oldVal !== newVal) {
			changes.push({field: k, type: "changed", oldVal: oldVal, newVal: newVal});
		}
	}
	return changes;
}

function handleSnapshot(response, relPath, cwd, message) {
	utils.execGit(["add", "--", relPath], cwd, function(addErr) {
		if(addErr) {
			utils.sendJson(response, 200, {op: "snapshot", status: "error", error: "git add failed: " + addErr.message});
			return;
		}
		utils.execGit(["commit", "-m", message, "--", relPath], cwd, function(commitErr, stdout) {
			if(commitErr) {
				if(commitErr.message && commitErr.message.indexOf("nothing to commit") !== -1) {
					utils.sendJson(response, 200, {op: "snapshot", status: "ok", output: "Nothing to commit — file is already up to date."});
				} else {
					utils.sendJson(response, 200, {op: "snapshot", status: "error", error: commitErr.message});
				}
			} else {
				utils.sendJson(response, 200, {op: "snapshot", status: "ok", output: stdout.trim()});
			}
		});
	});
}

function handleStashPush(response, relPath, cwd, message) {
	utils.execGit(["stash", "push", "-m", message, "--", relPath], cwd, function(err, stdout) {
		if(err) {
			utils.sendJson(response, 200, {op: "stash-push", status: "error", error: err.message});
		} else {
			utils.sendJson(response, 200, {op: "stash-push", status: "ok", output: stdout.trim()});
		}
	});
}
