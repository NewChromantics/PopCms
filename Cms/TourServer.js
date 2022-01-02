import * as Pop from './PopApi.js'
import * as FileSystem from 'fs'
import Git from 'nodegit'
import Params from './Params.js'
import Path from 'path'

import Moment from "moment";

const RemoteName = "origin";


//	keep a record of anything we do locally
let LocalRepositoryLog = [];


//	if this is set, then make any new commits fail, until it works
let SyncError = null;
let SyncLastDate = null;

export function GetLastSyncStatus()
{
	if ( SyncError )
		return `Sync Error: ${SyncError}`;
		
	if ( !SyncLastDate )
		return `Not yet synchronised`;
	
	const SyncAgo = DateToString(SyncLastDate);
	return `Last synchronised ${SyncAgo}`;
}


//	keep a background thread running, where we kick off a timer
//	and check no more commits have been made for X seconds
//	so we only sync once no-commits have been made
let SyncPromiseQueue = new Pop.PromiseQueue('Git sync');
async function SyncWithRemoteThread()
{
	LocalGitLog(`Starting SyncWithRemoteThread()`);
	while(true)
	{
		const CommitTimeMs = await SyncPromiseQueue.WaitForLatest();
		
		//	we often get commits in quick succession, so skip over them
		await Pop.Yield(5*1000);
		if ( SyncPromiseQueue.HasPending() )
		{
			LocalGitLog(`Commit detected, detected quick subsequent commit, waiting again.`);
			continue;
		}
		
		LocalGitLog(`Commit detected, waiting ${Params.SyncDelaySecs} secs before sync...`);
		await Pop.Yield(Params.SyncDelaySecs*1000);
		
		if ( SyncPromiseQueue.HasPending() )
		{
			LocalGitLog(`Commit since sync delay, sync aborted`);
			continue;
		}
		
		try
		{
			LocalGitLog(`Pushing to remote repository...`);
			await PushRepositoryToRemote();
			SyncError = null;	//	successful commit, remove any previous error
			SyncLastDate = new Date();
			LocalGitLog(`Pushed to remote succesfully.`);
		}
		catch(e)
		{
			SyncError = `${e}`;
			LocalGitLog(`PushRepositoryToRemote Error: ${e}`);
		}
	}
}
SyncWithRemoteThread().catch(LocalGitLog);

function TriggerRepositorySync()
{
	const NowMs = new Date().getTime();
	SyncPromiseQueue.Push(NowMs);
}






function LocalGitLog(Message)
{
	const Log = {};
	Log.DateTime = Date.now();
	Log.Message = Message;
	LocalRepositoryLog.push(Log);
	console.log(`GitLog: ${Message}`);
}

function CommitToStruct(Commit)
{
	const Struct = {};
	Struct.Sha = Commit.sha();
	Struct.AuthorName = Commit.author().name();
	Struct.AuthorEmail = Commit.author().email();
	Struct.Date = Commit.date();
	Struct.Message = Commit.message();
	return Struct;
}

//	this returns the Repos, but clones if missing
async function GetRepository()
{
	if ( !FileSystem.existsSync(Params.RepositoryPath) )
	{
		LocalGitLog(`Git path [${Params.RepositoryPath}] missing; Cloning from... ${Params.RepositoryUrl}`);
		//	gr: do/should we clone explitily to remote name RemoteName
		try
		{
			const NewRepository = await Git.Clone(Params.RepositoryUrl, Params.RepositoryPath);
		}
		catch(e)
		{
			SyncError = e;
			throw e;
		}
		SyncLastDate = new Date();
		SyncError = null;
		LocalGitLog(`Cloned repository.`);
	}
	
	return await Git.Repository.open(Params.RepositoryPath);
}

function GetPushCredentials(Url,Username)
{
	console.log(`GetPushCredentials(${Url},${Username})`);
	Username = Params.GitPushUsername;
	const Password = Params.GitPushPassword;
	console.log(`Username=${Username} key=${Password}`);
	try
	{
		const Credential = Git.Cred.userpassPlaintextNew( Username, Password );
		console.log(`Credential=${Credential}`);
		return Credential;
	}
	catch(e)
	{
		LocalGitLog(`GetPushCredentials error; ${e}`);
	}
}

async function PushRepositoryToRemote()
{
	const Repository = await GetRepository();
	const Remote = await Repository.getRemote(RemoteName);
	//	https://github.com/nodegit/nodegit/blob/a25279f97ca9913f205cdb2335bc3ce918d9305b/test/tests/remote.js#L166
	const ref = `refs/heads/${Params.DraftBranch}`;
	const refs = [ref + ":" + ref];
	const fetchOpts = {};
	
	fetchOpts.callbacks = {};
	fetchOpts.callbacks.transferProgress = console.log;
	fetchOpts.callbacks.credentials = GetPushCredentials;

	const Result = await Remote.push(refs, fetchOpts);
	LocalGitLog(`Push to remote result: ${Result}`);
}

//	Date -> "Day etc (x years ago)"
function DateToString(Date)
{
	try
	{
		const TimeAgo = Moment(Date).fromNow();
		return TimeAgo;
	}
	catch(e)
	{
		console.log(`Error converting ${Date} to string; ${e}`);
		return Date;
	}
}

export async function GetGitLog()
{
	const Repos = await GetRepository();
	let LatestCommit = await Repos.getBranchCommit(Params.DraftBranch);
	const Commits = [LatestCommit];
	
	let LogOutput = [];
	LogOutput.push(`Local Repository Log (since server bootup)`);
	LogOutput.push(`-----------------`);
	for ( let Log of LocalRepositoryLog )
	{
		const Time = DateToString(Log.DateTime);
		LogOutput.push(`${Time}: ${Log.Message}`);
	}
	
	LogOutput.push('\n');
	LogOutput.push(`Latest Commits`);
	LogOutput.push(`-----------------`);
	for ( let Commit of Commits )
	{
		const CommitStruct = CommitToStruct(Commit);
		LogOutput.push( DateToString(CommitStruct.Date) );
		LogOutput.push( JSON.stringify(CommitStruct,null,'\t') );
		LogOutput.push('\n');
	}
	return LogOutput.join('\n');
}




export async function GetLastGitCommit()
{
	const Repos = await GetRepository();
	let LatestCommit = await Repos.getBranchCommit(Params.DraftBranch);
	LatestCommit = CommitToStruct(LatestCommit);
	return LatestCommit;
}



//	returns
//	{}
//	.Contents = file contents
//	.CommitMeta = commit meta
async function GetRepositoryFile(Filename)
{
	//	here is where we need to update cache
	
	//	make sure we've cloned
	const Repos = await GetRepository();
	
	//	todo:
	//	- make sure we're on the right branch
	//	- make sure we've pulled
	const FilePath = `${Params.RepositoryPath}/${Filename}`;
	if ( !FileSystem.existsSync(FilePath) )
		throw `No such file in repository ${FilePath}`;
	
	//	read file contents
	const Commit = await Repos.getBranchCommit(Params.DraftBranch);
	const Entry = await Commit.getEntry(Filename);
	const Blob = await Entry.getBlob();
	//console.log(`Got blob; ${Blob}`);
	
	const File = {};
	File.Contents = Blob;
	File.CommitMeta = CommitToStruct(Commit);
	
	return File;
}


function IsSafeFilename(Filename)
{
	//	check if the filename has traversed out of a folder
	const FakeRootPath = '/Root/Path/';
	const ResolvedPath = Path.join(FakeRootPath,Filename);
	console.log(`ResolvedPath->${ResolvedPath}`);
	if ( !ResolvedPath.startsWith(FakeRootPath) )
		throw `${Filename} has path traversal ${ResolvedPath}`;	

	if ( !Filename.length )
		throw `Empty filename`;
	
	//	no files beginning with dot
	if ( Filename[0] == '.' )
		throw `Filename begins with dot`;
		
	//	no files beginning with dot
	if ( Filename[0] == '/' )
		throw `Filename begins with slash`;
		
	return true;
}

//	commit this file, return the new commit[struct]
export async function CommitRepositoryFileContents(Filename,Contents,AuthorName,AuthorEmail,CommitMessage)
{
	IsSafeFilename(Filename);
	
	console.log(`CommitRepositoryFileContents`,Filename,Contents);
	if ( SyncError )
	{
		//throw `Git sync error; ${SyncError}. Commit aborted`;
		console.error(`Git sync error; ${SyncError}. Commit wont sync`);
	}
		
	const Repos = await GetRepository();
	const Index = await Repos.refreshIndex();

	//	write file to disk
	const FilePath = `${Params.RepositoryPath}/${Filename}`;
	try
	{
		//	gr: would be great if we could skip over this and write into the index with ram
		const FileParams = {};
		//FileParams.encoding = 'utf8';
		console.log(`Writing file ${FilePath}...`);
		await FileSystem.promises.writeFile(FilePath, Contents, FileParams);
	}
	catch(e)
	{
		throw `CommitRepositoryFileContents write file error (${FilePath}); ${e}`;
	}
	
	//	gr: do we need to check here nothing else is added?
	//	add file (repository name)
	console.log(`CommitRepositoryFileContents addByPath(${Filename});`);
	await Index.addByPath(Filename);
	//	write to index
	await Index.write();

	//	gr: what is OID? not a sha?
	const Oid = await Index.writeTree();
	console.log(`CommitRepositoryFileContents write tree oid ${Oid}`);
	
	//	get the commit we're pushing after
	const ParentCommit = await Repos.getHeadCommit();
	const Author = Git.Signature.now( AuthorName, AuthorEmail );
	const Committer = Author;
	const CommitId = await Repos.createCommit("HEAD", Author, Committer, CommitMessage, Oid, [ParentCommit] );
	console.log("New Commit: ", CommitId);
	
	//	refetch commit to return
	let Commit = await Repos.getCommit(CommitId);
	Commit = CommitToStruct(Commit);

	TriggerRepositorySync();

	return Commit;
}





function GetRandomIdent(Length=8)
{
	const ArtifactAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	//	random X chars in alphabet
	
	const CharIndexes = [];
	for ( let i=0;	i<Length;	i++ )
	{
		const Char = Pop.RandomInt(0,ArtifactAlphabet.length);
		CharIndexes.push(Char);
	}
	const abcd = CharIndexes.map( i => ArtifactAlphabet[i] );
	return abcd.join('');
}


function GetFileExtension(MimeType)
{
	MimeType = MimeType.toLowerCase();
	
	const MimeExtensions = {};
	MimeExtensions['image/jpeg'] = 'jpg';
	MimeExtensions['image/png'] = 'png';
	MimeExtensions['data/zip'] = 'zip';
	MimeExtensions['application/zip'] = 'zip';
	MimeExtensions['application/x-zip-compressed'] = 'zip';
	MimeExtensions['multipart/x-zip'] = 'zip';
	
	const Extension = MimeExtensions[MimeType];
	if ( !Extension )
		throw `No defined extension for mime type [${MimeType}]`;
	
	return Extension;
}

const MimeFilenamePattern = `data/(.+)[\.]([a-zA-Z0-9]+)$`;

function GetNewAssetNameFromMime(Directory,Mime)
{
	//	if the mime has a . in it, we can assume it's a filename, 
	//	and for now, keep that
	const MimeFilenameMatch = Mime.match( MimeFilenamePattern )
	if ( MimeFilenameMatch )
	{
		console.log(`MimeFilenameMatch;`);
		console.log(MimeFilenameMatch);
		
		const Name = MimeFilenameMatch[1];
		const Extension = MimeFilenameMatch[2];
		const Filename = `${Name}.${Extension}`;
		const FilePath = `${Directory}/${Filename}`;
		if ( FileSystem.existsSync(FilePath) )
		{
			throw `Filename clash: ${FilePath}`;
		}
		return Filename;
	}
	
	const Extension = GetFileExtension(Mime);
	const AssetName = GetNewAssetName(Directory,Extension);
	return AssetName;
}
		
//	generate a new filename that doesn't clash with another in this directory
function GetNewAssetName(Directory,Extension)
{
	const Tries = 100;
	for ( let i=0;	i<Tries;	i++ )
	{
		const Ident = GetRandomIdent();
		const Filename = `${Ident}.${Extension}`;
		const FilePath = `${Directory}/${Filename}`;
		
		if ( FileSystem.existsSync(FilePath) )
		{
			console.log(`Filename clash: ${FilePath}`);
			continue;
		}
		return Filename;
	}
	throw `Failed to generate new asset name after 100 tries`;
}

function ValidateNewAssetFilename(Filename,AssetDirectory)
{
	//	check has an extension
	const Parts = Filename.split('.');
	if ( Parts.length < 2 )
		throw `Filename missing extension`;
	if ( Parts[Parts.length-1].length < 3 )
		throw `Filename extension is too short (${Parts[Parts.length-1]})`;

	if ( Parts.some( p => !p.length ) )
		throw `Filename empty part before extension`;

	//	gr: do regex to validate allowed characters
	const AllowedChars = 'a-zA-Z0-9\\._-';
	//const ValidPattern = new RegExp(`^([${AllowedChars}])+\\.([${AllowedChars}])+$`);
	const ValidPattern = new RegExp(`^([${AllowedChars}]+)$`);
	const PatternMatch = Filename.match(ValidPattern);
	if ( !PatternMatch )
		throw `${Filename} failed to match valid characters (${AllowedChars})`;
	
	const FilePath = `${AssetDirectory}/${Filename}`;
	if ( FileSystem.existsSync(FilePath) )
		throw `Filename already used`;
		
	return `${PatternMatch[0]}`;
}
