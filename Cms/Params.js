function CheckIsString(Value,Context)
{
	if ( typeof Value != 'string' )
		throw `Value(${Context}) is not a string`;
	return Value;
}



export const Params = {};
export default Params;

Params.RepositoryPath = CheckIsString( process.env.ASSETS_DIR || '../Assets', 'process.env.GIT_DIR' );
Params.DraftBranch = CheckIsString( process.env.GIT_DIR || 'main', 'process.env.GIT_DIR' );
Params.RepositoryUrl = CheckIsString( process.env.GIT_REPOSITORYURL, 'process.env.GIT_REPOSITORYURL' );
Params.SyncDelaySecs = 60;
Params.GitPushUsername = CheckIsString( process.env.GIT_AUTHUSER, 'process.env.GIT_AUTHUSER' );
Params.GitPushPassword = CheckIsString( process.env.GIT_AUTHPASS, 'process.env.GIT_AUTHPASS' );

