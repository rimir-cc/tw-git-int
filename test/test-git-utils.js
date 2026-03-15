/*\
title: $:/plugins/rimir/git-int/test/test-git-utils.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for git-int utility functions.

\*/
"use strict";

describe("git-int: git-utils", function() {

	var utils = require("$:/plugins/rimir/git-int/git-utils");

	describe("parseTidFields", function() {
		it("should parse key-value pairs from .tid header", function() {
			var text = "title: My Tiddler\ntags: tagA tagB\ntype: text/vnd.tiddlywiki\n\nBody text here";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("My Tiddler");
			expect(fields.tags).toBe("tagA tagB");
			expect(fields.type).toBe("text/vnd.tiddlywiki");
		});

		it("should stop at first blank line", function() {
			var text = "title: Test\n\nThis is body\nfield: not-a-field";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("Test");
			expect(fields.field).toBeUndefined();
		});

		it("should handle empty input", function() {
			var fields = utils.parseTidFields("");
			expect(Object.keys(fields).length).toBe(0);
		});

		it("should handle fields with colons in values", function() {
			var text = "title: My: Tiddler\nurl: https://example.com\n\n";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("My: Tiddler");
			expect(fields.url).toBe("https://example.com");
		});

		it("should handle CRLF line endings", function() {
			var text = "title: Test\r\ntags: foo\r\n\r\nBody";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("Test");
			expect(fields.tags).toBe("foo");
		});

		it("should handle bare CR line endings", function() {
			var text = "title: Test\rtags: bar\r\rBody";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("Test");
			expect(fields.tags).toBe("bar");
		});

		it("should handle header-only input (no blank line)", function() {
			var text = "title: Solo\ntags: alpha";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("Solo");
			expect(fields.tags).toBe("alpha");
		});

		it("should ignore lines without colon-space separator", function() {
			var text = "title: Valid\nmalformed-line\ntags: ok\n\n";
			var fields = utils.parseTidFields(text);
			expect(fields.title).toBe("Valid");
			expect(fields.tags).toBe("ok");
		});
	});

	describe("parseTidBody", function() {
		it("should return text after first blank line", function() {
			var text = "title: Test\ntags: foo\n\nBody content here\nSecond line";
			expect(utils.parseTidBody(text)).toBe("Body content here\nSecond line");
		});

		it("should return empty string when no body", function() {
			var text = "title: Test\ntags: foo";
			expect(utils.parseTidBody(text)).toBe("");
		});

		it("should return empty string for empty input", function() {
			expect(utils.parseTidBody("")).toBe("");
		});

		it("should handle multiple blank lines — stops at first", function() {
			var text = "title: Test\n\nFirst paragraph\n\nSecond paragraph";
			expect(utils.parseTidBody(text)).toBe("First paragraph\n\nSecond paragraph");
		});

		it("should handle CRLF line endings", function() {
			var text = "title: Test\r\n\r\nBody with CRLF";
			expect(utils.parseTidBody(text)).toBe("Body with CRLF");
		});

		it("should handle body that is just whitespace", function() {
			var text = "title: Test\n\n   ";
			expect(utils.parseTidBody(text)).toBe("   ");
		});
	});

	describe("sendJson", function() {
		it("should write correct status code and JSON body", function() {
			var writtenHead = null;
			var writtenBody = null;
			var mockResponse = {
				writeHead: function(code, headers) {
					writtenHead = {code: code, headers: headers};
				},
				end: function(body) {
					writtenBody = body;
				}
			};
			utils.sendJson(mockResponse, 200, {ok: true, msg: "hello"});
			expect(writtenHead.code).toBe(200);
			expect(writtenHead.headers["Content-Type"]).toBe("application/json");
			var parsed = JSON.parse(writtenBody);
			expect(parsed.ok).toBe(true);
			expect(parsed.msg).toBe("hello");
		});

		it("should handle error status codes", function() {
			var writtenHead = null;
			var mockResponse = {
				writeHead: function(code, headers) {
					writtenHead = {code: code, headers: headers};
				},
				end: function() {}
			};
			utils.sendJson(mockResponse, 404, {error: "not found"});
			expect(writtenHead.code).toBe(404);
		});

		it("should serialize nested objects", function() {
			var writtenBody = null;
			var mockResponse = {
				writeHead: function() {},
				end: function(body) { writtenBody = body; }
			};
			utils.sendJson(mockResponse, 200, {data: {nested: [1, 2, 3]}});
			var parsed = JSON.parse(writtenBody);
			expect(parsed.data.nested.length).toBe(3);
		});
	});
});
