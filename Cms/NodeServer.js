import os from 'os'
import fs from 'fs'
import ExpressModule from 'express'
import {Params} from './Params.js'
import * as TourApi from './TourServer.js'
import * as Pop from './PopApi.js'

//	if this import errors because of the file type, make sure we run with 
//		--experimental-json-modules
//	ie; node --experimental-json-modules ./NodeServer.js
//const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
import PackageJson from './package.json'
//	todo: work out if we can read docker's tag
let Version = process.env.VERSION || PackageJson.version;
console.log(`Version=${Version}`);


//	multi-part file form support
//	https://stackoverflow.com/questions/23114374/file-uploading-with-express-4-0-req-files-undefined
import ExpressFileUpload from "express-fileupload";



function ReadNumberOrNull(Key,Name)
{
	const Value = process.env[Key];
	if ( Value == 'null' )
		return null;
	const Num = Number(Value);
	if ( isNaN(Num) )
		throw `${Value}(${Name}) needs to be a number`;
	return Value;
}

function IntegerOrNull(Value,Name)
{
	const Num = NumberOrNull(Value);
	if ( Num === null )
		return null;
	if ( !Number.isInteger(Num) )
		throw `${Value}(${Name}) needs to be integer`;
	return Num;
}

function CheckIsInteger(Value)
{
	const Num = Number(Value);
	if ( isNaN(Num) )
		throw `Value is not a number (expecting integer)`;
	if ( !Number.isInteger(Num) )
		throw `Value needs to be integer`;
	return Num;
}

function CheckIsString(Value,Context)
{
	if ( typeof Value != 'string' )
		throw `Value(${Context}) is not a string`;
	return Value;
}

const CorsOrigin = process.env.CorsOrigin || '*';
const ErrorStatusCode = CheckIsInteger( process.env.ErrorStatusCode || 500 );
//const StaticFilesPath = process.env.StaticFilesPath || './';
const HttpListenPort = CheckIsInteger( process.env.HttpListenPort || 8080 );

//	defaults here are for node.js CLI
//	expecting dockerfile to set these paths with ENV to make sure it's correct
//	for the dockerfile COPY
const AssetsPath = Params.RepositoryPath;
const BrowserPath = CheckIsString( process.env.BROWSER_DIR || '../Browser', 'process.env.BROWSER_DIR' );

const AssetListUrl = CheckIsString( process.env.ASSET_LIST_URL || 'List', 'process.env.ASSET_LIST_URL' );
const AssetUploadUrl = CheckIsString( process.env.ASSET_UPLOAD_URL || 'Upload', 'process.env.ASSET_UPLOAD_URL' );
const ValidateNewAssetFilenameUrl = CheckIsString( process.env.VALIDATE_NEW_ASSET_FILENAME_URL || 'ValidateNewAssetFilename', 'process.env.VALIDATE_NEW_ASSET_FILENAME_URL' );
const BrowserUrl = CheckIsString( process.env.BROWSER_URL || 'Browser', 'process.env.BROWSER_URL' );
const AssetUrl = CheckIsString( process.env.ASSETS_URL || 'Asset', 'process.env.ASSET_URL' );
const GitStatusUrl = CheckIsString( process.env.GITSTATUS_URL || 'git', 'process.env.GITSTATUS_URL' );
const SyncStatusUrl = CheckIsString( process.env.SYNCSTATUS_URL || 'syncstatus', 'process.env.SYNCSTATUS_URL' );
const GitLastCommitUrl = CheckIsString( process.env.GITLASTCOMMIT_URL || 'gitlastcommit', 'process.env.GITLASTCOMMIT_URL' );

const AssetUrlPattern = new RegExp(`^/${AssetUrl}/(.*)$`);	
const BrowserUrlPattern = new RegExp(`^/${BrowserUrl}/(.*)$`);	
const AssetListUrlPattern = new RegExp(`^/${AssetListUrl}$`);
const AssetUploadUrlPattern = new RegExp(`^/${AssetUploadUrl}$`);
const ValidateNewAssetFilenameUrlPattern = new RegExp(`^/${ValidateNewAssetFilenameUrl}$`);

console.log(`AssetsPath=${AssetsPath}`);
console.log(`BrowserPath=${BrowserPath}`);
console.log(`AssetListUrl=${AssetListUrl}`);
console.log(`BrowserUrl=${BrowserUrl}`);
console.log(`AssetUrl=${AssetUrl}`);

try
{
	const AllEnv = JSON.stringify(process.env,null,'\t');
	console.log(`env (all) ${AllEnv}`);
}
catch(e)
{
	console.log(`env (all) error -> ${e}`);
}



//	API routing
const HttpServerApp = ExpressModule();

//	enable express-fileupload support
//	https://github.com/richardgirges/express-fileupload/tree/da968ef0365eba4bad73909737700798d89d2ad7#available-options
const FileUploadOptions = {};
//FileUploadOptions.createParentPath = true;	//	create paths with .mv()
FileUploadOptions.safeFileNames = true;
HttpServerApp.use(ExpressFileUpload(FileUploadOptions));

//	gr: when changing these, dont forget to disable cache on chrome, or you'll be scratching your head for ages
//HttpServerApp.get('/', function (req, res) { res.redirect('/index.html') });
HttpServerApp.get('/', function (req, res) { res.redirect(BrowserUrl) });	//	temp for development.

HttpServerApp.use(BrowserUrlPattern, HandleBrowserUrl );
HttpServerApp.get(AssetListUrlPattern,HandleGetAssetFileList);
HttpServerApp.get(AssetUploadUrlPattern,HandleUploadAssetFile_Get);
HttpServerApp.post(AssetUploadUrlPattern,HandleUploadAssetFile);
HttpServerApp.get(ValidateNewAssetFilenameUrlPattern,HandleValidateNewAssetFilename);
HttpServerApp.use(AssetUrlPattern, HandleAssetUrl );

HttpServerApp.get(`/${GitStatusUrl}`,HandleGitLog);
HttpServerApp.get(`/${SyncStatusUrl}`,HandleSyncStatus);
HttpServerApp.get(`/${GitLastCommitUrl}`,HandleGitLastCommit);


const HttpServer = HttpServerApp.listen( HttpListenPort, () => console.log( `http server on ${JSON.stringify(HttpServer.address())}` ) );


function HandleBrowserUrl(req,res,next)
{
	let Filename = req.params[0];
	if ( !Filename || Filename.length == 0 )
		Filename = '/';
	//	throw `Filename missing from HandleAssetUrl (OrgName=${OrgName})`;

	console.log(`HandleBrowserUrl Filename=${Filename}`);
	req.url = Filename;
	ExpressModule.static(BrowserPath)(req, res, next);
}

function HandleAssetUrl(req,res,next)
{
	const Filename = req.params[0];
	if ( !Filename || Filename.length == 0 )
		throw `Filename missing from HandleAssetUrl`;

	console.log(`HandleAssetUrl Filename=${Filename}`);
	req.url = Filename;
	const AssetsPath = GetAssetsDirectory();
	ExpressModule.static(AssetsPath)(req, res, next);
}


function GetAssetsDirectory()
{
	return AssetsPath;
}



async function HandleGetArtifact(Request,Response)
{
	try
	{
		const ArtifactStream = await GetArtifactPipe(Request);
		
		const Output = {};
		Output.Mime = 'application/octet-stream';
		
		const StreamFinished = Pop.CreatePromise();
		
		ArtifactStream.on('end', StreamFinished.Resolve );
		ArtifactStream.on('error', StreamFinished.Reject );
		
		//	PopImageServer generic code
		//const Output = await RunApp(Request);
		Output.StatusCode = Output.StatusCode || 200;
		Output.Mime = Output.Mime || 'text/plain';

		Response.statusCode = Output.StatusCode;
		Response.setHeader('Content-Type',Output.Mime);
		Response.setHeader('Access-Control-Allow-Origin',CorsOrigin);	//	allow CORS
		ArtifactStream.pipe(Response);
		
		//	should this wait until end event?
		//	we kinda need a way to stop if there was an error and not pipe until then?
		console.log(`Wait for stream finished`);
		await StreamFinished;
		Response.end();
		//Response.end(Output.Output);
	}
	catch (e)
	{
		console.log(`RunApp error -> ${e}`);
		Response.statusCode = ErrorStatusCode;
		Response.setHeader('Content-Type','text/plain');
		Response.end(`Error ${e}`);
	}
}


async function GetFileList(Path)
{
	const FileListPromise = Pop.CreatePromise();
	function OnReadDir(Error,Files)
	{
		if ( Error )
			FileListPromise.Reject(Error);
		else
			FileListPromise.Resolve(Files);
	}
	
	//	catch missing dir
	try
	{
		const Options = { withFileTypes: true };
		fs.readdir(Path, Options, OnReadDir );

		//	gr: now filter artifact names, get some meta etc
		const FileList = await FileListPromise;
		return FileList;
	}
	catch(e)
	{
		console.log(`Error with readdir(${Path}); ${e}`);
		return [];
	}
}

async function HandleResponse(Function,Request,Response)
{
	try
	{
		let Output = await Function(Request);

		//	if a string returned, auto convert to string content
		if ( typeof Output == typeof '' )
		{
			const Content = Output;
			Output = {};
			Output.Content = Content;
		}		

		//	PopImageServer generic code
		Output.StatusCode = Output.StatusCode || 200;
		Output.Mime = Output.Mime || 'text/plain';

		Response.statusCode = Output.StatusCode;
		Response.setHeader('Content-Type',Output.Mime);
		
		Response.end(Output.Content);
	}
	catch (e)
	{
		console.log(`HandleResponse error -> ${e}`);
		Response.statusCode = ErrorStatusCode;
		Response.setHeader('Content-Type','text/plain');
		Response.end(`Error ${e}`);
	}
}


async function HandleGetAssetFileList(Request,Response)
{
	async function GetAssetFileListOutput(Request)
	{
		const RequestAssetsPath = GetAssetsDirectory();
		console.log(`HandleGetAssetFileList(RequestAssetsPath=${RequestAssetsPath})`);
		
		//	get list of files as a promise
		const Files = await GetFileList(RequestAssetsPath);

		const Content = JSON.stringify(Files,null,'\t');
		return Content;
	}
	return HandleResponse( GetAssetFileListOutput, Request, Response );
}




async function HandleValidateNewAssetFilename(Request,Response)
{
	async function Run(Request)
	{
		const AssetDirectory = GetAssetsDirectory();
		
		const Filename = Request.query.Filename;
		if ( Filename === undefined )
			throw `No Filename parameter specified`;
		
		//	this will throw if bad
		return TourApi.ValidateNewAssetFilename(Filename,AssetDirectory);
		return 'Filename availible';
	}
	return HandleResponse( Run, Request, Response );
}


async function HandleUploadAssetFile_Get(Request,Response)
{
	async function Run(Request)
	{
		throw `GET used to upload file Must use POST`;
	}
	return HandleResponse( Run, Request, Response );
}



//	gr: this needs changing to allow existing file-overwrite, and causing a commit
async function HandleUploadAssetFile(Request,Response)
{
	async function Run(Request)
	{
		console.log(`HandleUploadAssetFile ${Request.files}`);
		console.log(Request.files);
		
		const AssetDirectory = GetAssetsDirectory();
		
		//	this comes through as a single file, despite the name
		if ( !Request.files )
			throw `Request.files is ${Request.files} expected object`;
		if ( Array.isArray(Request.files) )
			throw `Request.files is an array, should be single object`;

/*
uploaded form.append('content',blob);
Request.files = {
	content: {
		name: 'blob',
		data: <Buffer ff d8 ff e0 00 10 4a 46 49 46 00 01 01 00 00 01 00 01 00 00 ff db 00 43 00 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 01 ... 116932 more bytes>,
		size: 116982,
		encoding: '7bit',
		tempFilePath: '',
		truncated: false,
		mimetype: 'image/jpeg',
		md5: '38d932cd06d836980e454f8f43ea9bb4',
		mv: [Function: mv]
	}
}*/
		//	gr: don't seem to be getting filename formdata through, so using a queyr param
		const UploadedFile = Request.files.content;
		//const AssetName = TourApi.GetNewAssetNameFromMime(AssetDirectory,UploadedFile.mimetype);
		const AssetName = Request.query.Filename;
		if ( AssetName === undefined )
			throw `No Filename parameter specified`;

		const FileContents = UploadedFile.data;
		const AuthorName = `PopCms`;
		const AuthorEmail = `browser@pop.cms`;
		const CommitMessage = `UploadAssetFile(${AssetName})`;
		const Filename = AssetName;
		
		const NewCommit = await TourApi.CommitRepositoryFileContents(Filename,FileContents,AuthorName,AuthorEmail,CommitMessage);

		const Content = JSON.stringify(NewCommit,null,'\t');
		return Content;
	}
	return HandleResponse( Run, Request, Response );
}



async function HandleUploadOrgStruct(Request,Response)
{
	async function Run(Request)
	{
		const UploadedOrgContent = Request.body.content;
		
		let UploadedOrg;
		//	throw a specific error
		try
		{
			UploadedOrg = JSON.parse(UploadedOrgContent);
		}
		catch(e)
		{
			throw `Error parsing new org json; ${UploadedOrgContent}; ${e}`;
		}
		
		const Meta = await TourApi.CommitNewOrgStruct(OrgName,UploadedOrg);

		const Result = Meta;
		Result.Message = `Committed new org`;
		
		const Content = JSON.stringify(Result,null,'\t');
		return Content;
	}
	return HandleResponse( Run, Request, Response );
}



async function HandleGitLog(Request,Response)
{
	async function Run(Request)
	{
		let GitLog = await TourApi.GetGitLog();
		if ( typeof GitLog != typeof '' )
			GitLog = JSON.stringify(GitLog,null,'\t');
		return GitLog;
	}
	return HandleResponse( Run, Request, Response );
}

async function HandleSyncStatus(Request,Response)
{
	async function Run(Request)
	{
		let GitLog = await TourApi.GetLastSyncStatus();
		if ( typeof GitLog != typeof '' )
			GitLog = JSON.stringify(GitLog,null,'\t');
		return GitLog;
	}
	return HandleResponse( Run, Request, Response );
}

async function HandleGitLastCommit(Request,Response)
{
	async function Run(Request)
	{
		let GitLog = await TourApi.GetLastGitCommit();
		if ( typeof GitLog != typeof '' )
			GitLog = JSON.stringify(GitLog,null,'\t');
		return GitLog;
	}
	return HandleResponse( Run, Request, Response );
}
