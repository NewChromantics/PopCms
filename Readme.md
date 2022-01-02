Pop CMS is a simple web server, with a `GET` and `PUT` api to read/fetch and write/upload files.

Designed for use with web/tools to synchronise data (in files) without needing a native client, or manually using git, etc.

On first file request, the server will clone the specified repository.

From then on, every file change will cause a commit.

Periodically, after X seconds of no commits, the server will synchronise (push) to the master git repository. Originally this was used as an automated backup.
