What?
-------------
Pop CMS is a simple web server, with a GET and PUT api to read/fetch and write/upload files.

Designed for use with web/tools to synchronise data (in files) without needing a native client, or manually using git, etc.

On first file request, the server will clone the specified repository.

From then on, every file change will cause a commit.

Periodically, after X seconds of no commits, the server will synchronise (push) to the master git repository. Originally this was used as an automated backup.


Api Endpoints
--------------
`/List` list all asset filenames & meta as json
`/Upload` POST file asset
`/Assets/$filename` GET asset filename
`/Browser` UI to server

Configuration
------------------
CMS configuration is via environment variables (used in node, applied in dockerfile)

- `ASSETS_DIR` path to directory with assets
- `BROWSER_DIR` path to directory with editor html (`/Browser/` serves this)
- `BROWSER_URL` (default `Browser`) url end point for editor (not including slashes)
- `ASSETS_URL` (default `Assets`) url end point for assets (not including slashes)
- `ASSETS_LIST_URL` (default `List`) url end point for assets list (virtual filename)
- `ASSETS_UPLOAD_URL` (default `Upload`) url end point for POSTing files to assets (virtual filename). It will return a JSON with meta (eg. new asset filename)
- `VALIDATE_NEW_ASSET_FILENAME_URL` (default `ValidateNewAssetFilename`) `?Filename=XXXX` validates if a new filename is valid/availible
- `GITSTATUS_URL` (default `git`) git history (both commits and server activity)
- `SYNCSTATUS_URL` (default `syncstatus`) REST url for one-line git sync status
- `GITLASTCOMMIT_URL` (default `gitlastcommit`) Rest url for last commit JSON
- `ErrorStatusCode` (default `500`) http status code to return when there's an error (set to `200` and you'll see the error/exception in the page)
- `HttpListenPort` (deault `8080`) port to run http server on
- `GIT_AUTHUSER` and `GIT_AUTHPASS` are requried (won't boot if empty) to push back up to remote repository. Generate a Public Access Token on your github account, and use that. `GIT_AUTHUSER` may be superfolous... this will probably change to a client-side email for commit info
- `GIT_REPOSITORYURL` url to repository; eg. `https://github.com/NewChromantics/PopCms.git`
	- note: Currently not cloning private repositories. Will get this error;
	- `Error: remote authentication required but no callback set`
- `GIT_BRANCH` name of branch to commit to (default `main`)

Run locally with node 
------------------
`cd ./Cms` expecting CWD to be in CMS directory
`export GIT_AUTHUSER=you@you.com`
`export GIT_AUTHPASS=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN`
`export GIT_REPOSITORYURL=YOUR_GIT_URL`
`node ./NodeServer.js`
This should report what port it's running locally on.

Run locally with docker
-----------------
`todo:` docker cli

