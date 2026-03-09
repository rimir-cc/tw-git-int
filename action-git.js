/*\
title: $:/plugins/rimir/git-int/action-git
type: application/javascript
module-type: widget

Action widget for git operations.
- Read ops (log, show, stash-list, stash-show, stash-drop): GET /api/git
- Write ops (diff, snapshot, stash-push): POST /api/git with draft text

For show/stash-show, writes restored content into the draft tiddler's text field.

\*/

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ActionGit = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionGit.prototype = new Widget();

ActionGit.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionGit.prototype.execute = function() {
	this.gitOp = this.getAttribute("op");
	this.gitTitle = this.getAttribute("title");
	this.gitHash = this.getAttribute("hash");
	this.gitMessage = this.getAttribute("message");
	this.gitDraft = this.getAttribute("draft");
	this.gitIndex = this.getAttribute("index");
};

ActionGit.prototype.refresh = function(changedTiddlers) {
	return this.refreshSelf();
};

ActionGit.prototype.invokeAction = function(triggeringWidget, event) {
	var self = this;
	var op = this.gitOp;
	var title = this.gitTitle;
	if(!op) return true;

	// Write ops send draft text via POST
	var isWriteOp = (op === "diff" || op === "snapshot" || op === "stash-push");

	if(isWriteOp) {
		if(!title) return true;
		return this.invokePostAction();
	}

	// Read ops use GET
	var url = "/api/git?op=" + encodeURIComponent(op);

	if(title) {
		url += "&title=" + encodeURIComponent(title);
	} else if(op !== "stash-list") {
		return true;
	}

	if(op === "show" && this.gitHash) {
		url += "&hash=" + encodeURIComponent(this.gitHash);
	}
	if(op === "log") {
		url += "&count=20";
	}
	if((op === "stash-show" || op === "stash-drop") && this.gitIndex) {
		url += "&index=" + encodeURIComponent(this.gitIndex);
	}

	var tempTitle = "$:/temp/rimir/git-int/" + (title || "_global") + "/" + op;
	self.wiki.addTiddler(new $tw.Tiddler({
		title: tempTitle,
		type: "application/json",
		text: JSON.stringify({op: op, status: "loading"})
	}));

	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("X-Requested-With", "TiddlyWiki");
	xhr.onreadystatechange = function() {
		if(xhr.readyState === 4) {
			self.handleResponse(xhr, op, title, tempTitle);
		}
	};
	xhr.send();
	return true;
};

ActionGit.prototype.invokePostAction = function() {
	var self = this;
	var op = this.gitOp;
	var title = this.gitTitle;

	// Read all fields from the draft tiddler
	var draftFields = null;
	if(this.gitDraft) {
		var draftTiddler = this.wiki.getTiddler(this.gitDraft);
		if(draftTiddler) {
			draftFields = {};
			var skipFields = {"draft.of": true, "draft.title": true};
			for(var field in draftTiddler.fields) {
				if(!skipFields[field]) {
					draftFields[field] = draftTiddler.getFieldString(field);
				}
			}
			// Use the original title, not the draft title
			draftFields.title = title;
		}
	}

	var postBody = {
		op: op,
		title: title
	};
	if(draftFields !== null) {
		postBody.fields = draftFields;
	}
	if(this.gitMessage) {
		postBody.message = this.gitMessage;
	}
	if(this.gitHash) {
		postBody.hash = this.gitHash;
	}
	if(this.gitIndex) {
		postBody.index = this.gitIndex;
	}

	var tempTitle = "$:/temp/rimir/git-int/" + title + "/" + op;
	self.wiki.addTiddler(new $tw.Tiddler({
		title: tempTitle,
		type: "application/json",
		text: JSON.stringify({op: op, status: "loading"})
	}));

	var xhr = new XMLHttpRequest();
	xhr.open("POST", "/api/git", true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("X-Requested-With", "TiddlyWiki");
	xhr.onreadystatechange = function() {
		if(xhr.readyState === 4) {
			self.handleResponse(xhr, op, title, tempTitle);
		}
	};
	xhr.send(JSON.stringify(postBody));
	return true;
};

ActionGit.prototype.handleResponse = function(xhr, op, title, tempTitle) {
	var self = this;
	if(xhr.status === 200) {
		var data;
		try {
			data = JSON.parse(xhr.responseText);
		} catch(e) {
			data = {op: op, status: "error", error: "Invalid JSON response"};
		}
		// For diff results, snapshot the draft's modified timestamp for staleness detection
		if(op === "diff" && data.status === "ok" && self.gitDraft) {
			var dt = self.wiki.getTiddler(self.gitDraft);
			if(dt) {
				data.draftModified = dt.getFieldString("modified");
			}
		}
		self.wiki.addTiddler(new $tw.Tiddler({
			title: tempTitle,
			type: "application/json",
			text: JSON.stringify(data)
		}));
		// For show/stash-show, write restored content and fields into draft tiddler
		if((op === "show" || op === "stash-show") && data.status === "ok" && self.gitDraft) {
			var draftTiddler = self.wiki.getTiddler(self.gitDraft);
			if(draftTiddler) {
				// Keep only draft-system fields, replace everything else with restored version
				var keepFields = {"title": true, "draft.of": true, "draft.title": true};
				var newFields = {};
				// Start with draft-system fields
				for(var df in draftTiddler.fields) {
					if(keepFields[df]) {
						newFields[df] = draftTiddler.fields[df];
					}
				}
				// Apply restored fields
				if(data.fields) {
					for(var f in data.fields) {
						if(!keepFields[f] && f !== "text") {
							newFields[f] = data.fields[f];
						}
					}
				}
				// Apply restored text
				if(data.content !== undefined) {
					newFields.text = data.content;
				}
				self.wiki.addTiddler(new $tw.Tiddler(newFields));
			}
		}
		// After stash-push or stash-drop, auto-refresh the stash list
		if((op === "stash-push" || op === "stash-drop") && data.status === "ok") {
			self.refreshStashList(title);
		}
		// After snapshot, auto-refresh the history log
		if(op === "snapshot" && data.status === "ok") {
			self.refreshLog(title);
		}
	} else {
		self.wiki.addTiddler(new $tw.Tiddler({
			title: tempTitle,
			type: "application/json",
			text: JSON.stringify({op: op, status: "error", error: "HTTP " + xhr.status})
		}));
	}
};

ActionGit.prototype.refreshStashList = function(title) {
	var self = this;
	var url = "/api/git?op=stash-list";
	if(title) url += "&title=" + encodeURIComponent(title);
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("X-Requested-With", "TiddlyWiki");
	xhr.onreadystatechange = function() {
		if(xhr.readyState === 4 && xhr.status === 200) {
			self.wiki.addTiddler(new $tw.Tiddler({
				title: "$:/temp/rimir/git-int/" + (title || "_global") + "/stash-list",
				type: "application/json",
				text: xhr.responseText
			}));
		}
	};
	xhr.send();
};

ActionGit.prototype.refreshLog = function(title) {
	var self = this;
	var url = "/api/git?op=log&title=" + encodeURIComponent(title) + "&count=20";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("X-Requested-With", "TiddlyWiki");
	xhr.onreadystatechange = function() {
		if(xhr.readyState === 4 && xhr.status === 200) {
			self.wiki.addTiddler(new $tw.Tiddler({
				title: "$:/temp/rimir/git-int/" + (title || "_global") + "/log",
				type: "application/json",
				text: xhr.responseText
			}));
		}
	};
	xhr.send();
};

exports["action-git"] = ActionGit;
