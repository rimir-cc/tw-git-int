/*\
title: $:/plugins/rimir/git-int/test/test-tid-content.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for .tid content building and field change detection.

\*/
"use strict";

describe("git-int: getFieldOrder", function() {

	var utils = require("$:/plugins/rimir/git-int/git-utils");

	it("should extract field names from .tid header", function() {
		var content = "title: My Tiddler\ntags: foo bar\ntype: text/vnd.tiddlywiki\n\nBody";
		expect(utils.getFieldOrder(content)).toEqual(["title", "tags", "type"]);
	});

	it("should stop at first blank line", function() {
		var content = "title: Test\ntags: a\n\ntext: not-a-field";
		expect(utils.getFieldOrder(content)).toEqual(["title", "tags"]);
	});

	it("should return empty array for empty input", function() {
		expect(utils.getFieldOrder("")).toEqual([]);
	});

	it("should handle CRLF line endings", function() {
		var content = "title: Test\r\ntags: foo\r\n\r\nBody";
		expect(utils.getFieldOrder(content)).toEqual(["title", "tags"]);
	});

	it("should handle header-only file (no blank line)", function() {
		var content = "title: Test\ntags: alpha";
		expect(utils.getFieldOrder(content)).toEqual(["title", "tags"]);
	});

	it("should handle fields with colons in values", function() {
		var content = "title: My: Tiddler\nurl: https://example.com\n\n";
		expect(utils.getFieldOrder(content)).toEqual(["title", "url"]);
	});
});

describe("git-int: buildTidContent", function() {

	var utils = require("$:/plugins/rimir/git-int/git-utils");

	it("should build .tid content with fields and text", function() {
		var fields = {title: "Test", tags: "a b", text: "Hello world"};
		var result = utils.buildTidContent(fields, null);
		expect(result).toBe("tags: a b\ntitle: Test\n\nHello world");
	});

	it("should preserve original field order", function() {
		var original = "tags: old\ntitle: Old Title\ntype: text/vnd.tiddlywiki\n\nOld body";
		var fields = {title: "New Title", tags: "new", type: "text/vnd.tiddlywiki", text: "New body"};
		var result = utils.buildTidContent(fields, original);
		// Should follow original order: tags, title, type
		expect(result).toBe("tags: new\ntitle: New Title\ntype: text/vnd.tiddlywiki\n\nNew body");
	});

	it("should append new fields sorted after existing ones", function() {
		var original = "title: Test\n\nBody";
		var fields = {title: "Test", custom: "value", author: "me", text: "Body"};
		var result = utils.buildTidContent(fields, original);
		// title first (from original), then author, custom (sorted new fields)
		expect(result).toBe("title: Test\nauthor: me\ncustom: value\n\nBody");
	});

	it("should return null when fields is null", function() {
		expect(utils.buildTidContent(null, "anything")).toBeNull();
	});

	it("should handle empty text field", function() {
		var fields = {title: "Test"};
		var result = utils.buildTidContent(fields, null);
		expect(result).toBe("title: Test\n\n");
	});

	it("should exclude text from header fields", function() {
		var fields = {title: "Test", text: "Body content"};
		var result = utils.buildTidContent(fields, null);
		// text should only appear as body, not as a header field
		expect(result).toBe("title: Test\n\nBody content");
		expect(result.indexOf("text: ")).toBe(-1);
	});

	it("should drop removed fields when original had them", function() {
		var original = "title: Test\ntags: old\ntype: text/vnd.tiddlywiki\n\nBody";
		var fields = {title: "Test", text: "Body"};
		// tags and type are not in fields, so they should be dropped
		var result = utils.buildTidContent(fields, original);
		expect(result).toBe("title: Test\n\nBody");
	});

	it("should handle no original content", function() {
		var fields = {title: "New", tags: "a", text: "Content"};
		var result = utils.buildTidContent(fields, null);
		// All fields sorted alphabetically
		expect(result).toBe("tags: a\ntitle: New\n\nContent");
	});
});

describe("git-int: buildFieldChanges", function() {

	var utils = require("$:/plugins/rimir/git-int/git-utils");

	it("should detect added fields", function() {
		var changes = utils.buildFieldChanges({}, {title: "New", tags: "a"});
		expect(changes.length).toBe(2);
		expect(changes[0]).toEqual({field: "tags", type: "added", oldVal: "", newVal: "a"});
		expect(changes[1]).toEqual({field: "title", type: "added", oldVal: "", newVal: "New"});
	});

	it("should detect removed fields", function() {
		var changes = utils.buildFieldChanges({title: "Old", tags: "b"}, {});
		expect(changes.length).toBe(2);
		expect(changes[0]).toEqual({field: "tags", type: "removed", oldVal: "b", newVal: ""});
		expect(changes[1]).toEqual({field: "title", type: "removed", oldVal: "Old", newVal: ""});
	});

	it("should detect changed fields", function() {
		var changes = utils.buildFieldChanges({title: "Old"}, {title: "New"});
		expect(changes.length).toBe(1);
		expect(changes[0]).toEqual({field: "title", type: "changed", oldVal: "Old", newVal: "New"});
	});

	it("should return empty array when fields are identical", function() {
		var fields = {title: "Same", tags: "a b"};
		expect(utils.buildFieldChanges(fields, fields)).toEqual([]);
	});

	it("should skip modified, bag, and revision fields", function() {
		var changes = utils.buildFieldChanges(
			{modified: "old", bag: "old", revision: "1", title: "Same"},
			{modified: "new", bag: "new", revision: "2", title: "Same"}
		);
		expect(changes).toEqual([]);
	});

	it("should handle mixed add/remove/change", function() {
		var oldFields = {title: "Test", tags: "old", custom: "val"};
		var newFields = {title: "Test", tags: "new", author: "me"};
		var changes = utils.buildFieldChanges(oldFields, newFields);
		expect(changes.length).toBe(3);
		// Sorted by field name: author (added), custom (removed), tags (changed)
		expect(changes[0].field).toBe("author");
		expect(changes[0].type).toBe("added");
		expect(changes[1].field).toBe("custom");
		expect(changes[1].type).toBe("removed");
		expect(changes[2].field).toBe("tags");
		expect(changes[2].type).toBe("changed");
	});

	it("should handle both sides empty", function() {
		expect(utils.buildFieldChanges({}, {})).toEqual([]);
	});

	it("should detect text field changes", function() {
		var changes = utils.buildFieldChanges({text: "old body"}, {text: "new body"});
		expect(changes.length).toBe(1);
		expect(changes[0]).toEqual({field: "text", type: "changed", oldVal: "old body", newVal: "new body"});
	});
});
