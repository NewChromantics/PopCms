
const Warning = console.warn;


//	create a promise function with the Resolve & Reject functions attached so we can call them
function CreatePromise()
{
	let Callbacks = {};
	let PromiseHandler = function(Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	Prom.Resolve = Callbacks.Resolve;
	Prom.Reject = Callbacks.Reject;
	return Prom;
}

//	RandomInt(1,10)	returns 1..9
function RandomInt(Min,MaxExclusive)
{
	let Rand = Math.random();
	const Range = MaxExclusive - Min;
	//	scale
	Rand = Rand * Range;
	//	make int
	Rand = Math.floor(Rand);
	Rand += Min;
	return Rand;
}

function Yield(Milliseconds)
{
	const Promise = CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}


//	a promise queue that manages multiple listeners
//	gr: this is getting out of sync with the cyclic-fixing-copy in WebApi. Make it seperate!
class PromiseQueue
{
	constructor(DebugName='UnnamedPromiseQueue')
	{
		this.Name = DebugName;
		//	pending promises
		this.Promises = [];
		//	values we've yet to resolve (each is array capturing arguments from push()
		this.PendingValues = [];
	}

	async WaitForNext()
	{
		const Promise = this.Allocate();
		
		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending();
		
		return Promise;
	}

	//	this waits for next resolve, but when it flushes, it returns LAST entry and clears the rest; LIFO (kinda, last in, only out)
	async WaitForLatest()
	{
		const Promise = this.Allocate();

		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending(true);

		return Promise;
	}
	
	ClearQueue()
	{
		//	delete values, losing data!
		this.PendingValues = [];
	}
	
	//	allocate a promise, maybe deprecate this for the API WaitForNext() that makes more sense for a caller
	Allocate()
	{
		//	create a promise function with the Resolve & Reject functions attached so we can call them
		function CreatePromise()
		{
			let Callbacks = {};
			let PromiseHandler = function (Resolve,Reject)
			{
				Callbacks.Resolve = Resolve;
				Callbacks.Reject = Reject;
			}
			let Prom = new Promise(PromiseHandler);
			Prom.Resolve = Callbacks.Resolve;
			Prom.Reject = Callbacks.Reject;
			return Prom;
		}
		
		const NewPromise = CreatePromise();
		this.Promises.push( NewPromise );
		return NewPromise;
	}
	
	//	put this value in the queue, if its not already there (todo; option to choose oldest or newest position)
	PushUnique(Value)
	{
		const Args = Array.from(arguments);
		function IsMatch(PendingValue)
		{
			//	all arguments are now .PendingValues=[] or .RejectionValues=[]
			//	we are only comparing PendingValues, lets allow rejections to pile up as
			//	PushUnique wont be rejections. The Reject() code should have a RejectUnique() if this becomes the case
			if (!PendingValue.hasOwnProperty('ResolveValues'))
				return false;

			const a = PendingValue.ResolveValues;
			const b = Args;
			if ( a.length != b.length )	return false;
			for ( let i=0;	i<a.length;	i++ )
				if ( a[i] != b[i] )
					return false;
			return true;
		}
		//	skip adding if existing match
		if ( this.PendingValues.some(IsMatch) )
		{
			//Debug(`Skipping non-unique ${Args}`);
			return;
		}
		this.Push(...Args);
	}
	
	Push()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.ResolveValues = Args;
		this.PendingValues.push( Value );
		
		if ( this.PendingValues.length > 100 )
			Warning(`This (${this.Name}) promise queue has ${this.PendingValues.length} pending values and ${this.Promises.length} pending promises`,this);
		
		this.FlushPending();
	}
	
	GetQueueSize()
	{
		return this.PendingValues.length;
	}
	
	HasPending()
	{
		return this.PendingValues.length > 0;
	}
	
	FlushPending(FlushLatestAndClear=false)
	{
		//	if there are promises and data's waiting, we can flush next
		if ( this.Promises.length == 0 )
			return;
		if ( this.PendingValues.length == 0 )
			return;
		
		//	flush 0 (FIFO)
		//	we pre-pop as we want all listeners to get the same value
		if (FlushLatestAndClear && this.PendingValues.length > 1)
		{
			Warning(`Promise queue FlushLatest dropping ${this.PendingValues.length - 1} elements`);
		}
		const Value0 = FlushLatestAndClear ? this.PendingValues.splice(0,this.PendingValues.length).pop() : this.PendingValues.shift();
		const HandlePromise = function(Promise)
		{
			if ( Value0.RejectionValues )
				Promise.Reject( ...Value0.RejectionValues );
			else
				Promise.Resolve( ...Value0.ResolveValues );
		}
		
		//	pop array incase handling results in more promises, so we avoid infinite loop
		const Promises = this.Promises.splice(0);
		//	need to try/catch here otherwise some will be lost
		Promises.forEach( HandlePromise );
	}
	
	Resolve()
	{
		throw "PromiseQueue.Resolve() has been deprecated for Push() to enforce the pattern that we're handling a queue of values";
	}
	
	//	reject all the current promises
	Reject()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.RejectionValues = Args;
		this.PendingValues.push(Value);
		this.FlushPending();
	}
}

//	node.js compatible module format
//	gr: how can I export an import with node... want to split this into multiple modules
module.exports =
{
	PromiseQueue,
	CreatePromise,
	Yield,
	RandomInt	//	Math.
};
