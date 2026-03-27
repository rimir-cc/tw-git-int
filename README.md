# git integration

> Git version control integration for the TiddlyWiki editor

Git version control for individual tiddlers from within the TiddlyWiki editor. Commit, diff, restore, and stash changes without leaving edit mode.

## Key features

* **Inline diff** -- view current changes vs. last commit side by side
* **Commit** -- commit individual tiddlers with a commit message
* **Stash** -- stash/unstash and inspect stashed changes
* **Restore** -- restore tiddler content to any previous version
* **Draft-aware** -- works with unsaved edits (browser sends draft fields to server)
* **Multi-repo** -- automatically detects which git repo each tiddler belongs to (supports nested repos)
* **Toolbar button** -- accessible from the edit toolbar

## Prerequisites

* Git installed and available on the server's PATH
* Tiddler files must be inside a git repository (the wiki root, or separate repos for subdirectories)

## Quick start

Initialize git in your tiddlers directory (or use separate repos for subdirectories like `tiddlers/work/` and `tiddlers/private/`). Open any tiddler in edit mode and click the git icon in the toolbar to access diff, commit, and stash operations.

## Plugin Library

Install from the [rimir plugin library](https://rimir-cc.github.io/tw-plugin-library/) via *Control Panel → Plugins → Get more plugins*.

## License

MIT -- see [LICENSE.md](LICENSE.md)
