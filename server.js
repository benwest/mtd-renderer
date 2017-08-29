var express = require('express');
var fs = require('fs');
var bodyParser = require('body-parser');

var render = require('./render');
var queue = JSON.parse( fs.readFileSync('data.json') );
var working = false;

var app = express();

app.use( ( req, res, next ) => {
	
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
	
	next();
	
})

app.use( bodyParser.json({limit: '100mb'}) );
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));

app.use( '/movies', express.static('movies') );

app.post( '/render', ( req, res ) => {
	
	console.log( req.body );
        
    var { state, duration } = req.body;
    
    queue.push({
	    state,
	    duration,
	    progress: 0,
	    done: false
	})
	
	if ( !working ) next();
    
    res.sendStatus( 200 );
    
})

app.get('/status', ( req, res ) => res.send( queue ) );

app.listen( process.env.PORT || 8080, () => console.log('👍🏻') );

var next = () => {
	
	working = true;
	
	var task = queue.find( item => !item.done );
	
	if ( task ) {
		
		return render( queue.indexOf( task ), task.state, task.duration, onProgress( task ) )
			.then( url => {
				
				task.done = true;
				task.url = url;
				
				fs.writeFile( 'data.json', JSON.stringify( queue ) );
				
				next();
				
			})
		
	} else {
		
		working = false;
		
	}
	
}

var onProgress = task => progress => task.progress = progress;

next();

// var sample = {"config":{"margin":60,"size":[800,1000],"backgroundColor":[1,1,1],"textColor":[1,0,0],"cornerRadius":40,"blur":100,"fontSize":60,"debug":false},"blobs":[{"position":[543.1689453125,721.8310546875],"direction":[1,-1],"color":[1,0,0],"size":[350,350]},{"position":[393.8004455566406,584.8004150390625],"direction":[1,1],"color":[0,1,0],"size":[350,350]},{"position":[445.3066711425781,741.3067016601562],"direction":[-1,-1],"color":[0,0,1],"size":[350,350]}],"words":[{"position":0.9997423106844889},{"position":0.3333333333333333},{"position":0.5868585749130213}]}
