var FRAMERATE = 60;

var fs = require('fs');
var Jimp = require("jimp");
var ndarray = require('ndarray');
var { exec } = require('child_process');
var leftPad = require('left-pad');
var range = require('lodash/range');

var state = require('./state/state');
var createRenderer = require('./renderer/renderer');

var gl = require('gl')( 1, 1, { preserveDrawingBuffer: true } );
if ( gl === null ) throw new Error('xvfb-run -s "-ac -screen 0 1024x1024x24" node index');

var ext = gl.getExtension('STACKGL_resize_drawingbuffer')
function resizeGL ( w, h ) {
	
	if ( gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h ) {
		ext.resize( w, h );
	}
	
}

var Canvas = require('canvas');
var canvas = new Canvas( 1, 1 );
var ctx = canvas.getContext('2d');

function resizeCanvas ( w, h ) {
	
	if ( canvas.width !== w || canvas.height !== h ) {
		
		canvas.width = w;
		canvas.height = h;
		
	}
	
}

var draw = createRenderer(
	gl,
	resizeGL,
	ctx,
	resizeCanvas
);

var readGL = () => {
	
	var w = gl.drawingBufferWidth;
	var h = gl.drawingBufferHeight;
	
	var pixels = new Uint8Array( w * h * 4 );
	
	gl.readPixels( 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels );
	
	var nda = ndarray( pixels, [ h, w, 4 ] );
	
	// rotate & flip
	nda = nda.transpose( 1, 0, 2 ).step( 1, -1, 1 );
	
	return nda;
}

var composite = ( blobs, text ) => {
	
	// Blobs is ndarray
	// Text is buffer
		
	var w = blobs.shape[ 0 ];
	var h = blobs.shape[ 1 ];
	
	var out = new Jimp( w, h, 0x000000FF );
	var outData = out.bitmap.data;
	
	var x, y, idx,
		srcR, srcG, srcB, srcA, srcAInv,
		destR, destG, destB, destA;

	for ( x = 0; x < w; x++ ) {
		
		for ( y = 0; y < h; y++ ) {
			
			idx = ( w * y + x ) * 4;
			
			destR = blobs.get( x, y, 0 );
			destG = blobs.get( x, y, 1 );
			destB = blobs.get( x, y, 2 );
			
			srcA = text[ idx + 3 ];
			
			if ( srcA > 0 ) {
				
				srcA /= 255;
				srcR = text[ idx + 2 ];
				srcG = text[ idx + 1 ];
				srcB = text[ idx + 0 ];
				
				srcAInv = 1 - srcA;

				destR *= srcAInv;
				destG *= srcAInv;
				destB *= srcAInv;
				
				destR += srcR * srcA;
				destG += srcG * srcA;
				destB += srcG * srcA;
								
			}
			
			outData[ idx + 0 ] = destR;
			outData[ idx + 1 ] = destG;
			outData[ idx + 2 ] = destB;
						
		}
		
	}
	
	return out;
	
/*
	return new Promise( resolve => {
				
		out.getBuffer( Jimp.MIME_PNG, ( e, buf ) => {
			
			resolve( buf );
			
		});
		
	})
*/
	
}

var setState = newState => {
	
	Object.assign( state.config, newState.config );
	
	state.animations = [];
	
	state.blobs.forEach( ( blob, i ) => {
		
		var other = newState.blobs[ i ];
		
		blob.path = [];
		
		blob.position[ 0 ] = other.position[ 0 ];
		blob.position[ 1 ] = other.position[ 1 ];

		blob.direction[ 0 ] = other.direction[ 0 ];
		blob.direction[ 1 ] = other.direction[ 1 ];
		
		blob.color[ 0 ] = other.color[ 0 ];
		blob.color[ 1 ] = other.color[ 1 ];
		blob.color[ 2 ] = other.color[ 2 ];
		
		blob.size[ 0 ] = other.size[ 0 ];
		blob.size[ 1 ] = other.size[ 1 ];
		
	});
	
	state.words.forEach( ( word, i ) => {
		
		word.position = newState.words[ i ].position;
		
	});
	
}

var write = stream => buffer => new Promise( resolve => {
			
	if ( !stream.write( buffer ) ) {
		
		stream.once( 'drain', resolve );
		
	} else {
		
		process.nextTick( resolve );
		
	}
	
});

var writeFrame = ( id, i, total, onProgress ) => {
	
	var filename = `frames/${ id }_${ leftPad( i, 5, '0' ) }.png`;
	
	return fileExists( filename )
		.then( exists => {
						
			if ( exists ) {
				
				console.log( `Skipping ${ filename }` );
				
				return Promise.resolve( filename );
				
			}
			
			onProgress( `${ i + 1 }/${ total }` );
			
			console.log( `Rendering ${ filename }` );
			
			state.update( 0, i / FRAMERATE );
			
			draw( state );
			
			var frame = composite( readGL(), canvas.toBuffer( 'raw' ) );
			
			return new Promise( resolve => {
			
				frame.write( filename, ( err, res ) => {
					
					console.log( `${ filename } written` );
					
					resolve( filename );
					
				});
				
			})

			
		})
			
}

var deleteFile = file => new Promise( resolve => {
	
	fs.unlink( file, ( err, res ) => resolve( res ) );
	
})

var fileExists = file => new Promise( resolve => fs.access( file, err => resolve( !err ) ) );

var sequence = fns => {
		
	var p = Promise.resolve();
	
	var results = [];
	
	fns.forEach( fn => {
		
		p = p
			.then( fn )
			.then( result => results.push( result ) );
		
	})
	
	return p.then( () => results );
	
}

var writeVideo = id => new Promise( resolve => {
	
	var file = `movies/${ id }.mp4`;
	
	exec(
		`ffmpeg -y -r ${FRAMERATE} -i frames/${ id }_%05d.png -vcodec libx264 -pix_fmt yuv420p ${ file }`,
		( err, res ) => {
			console.log( `${ file } written` );
			resolve( file );
		}
	);
	
})

var renderVideo = ( id, initialState, duration, onProgress ) => {
	
	var frames = Math.floor( duration * FRAMERATE );
	
	setState( initialState );
	
	return sequence( range( frames ).map( i => () => writeFrame( id, i, frames, onProgress ) ))
		.then( files => {
			
			return writeVideo( id )
				.then( video => Promise.resolve( [ files, video ] ) )
			
		})
		.then( ( [ files, video ] ) => {
			
			return sequence( files.map( file => () => deleteFile( file ) ) )
				.then( () => video )
			
		})
	
/*
	return writeFrames( id, frames, onProgress )
		.then( files => {
			
			return writeVideo( id )
				.then( video => Promise.resolve( [ files, video ] ) )
			
		})
		.then( ([ files, video ] ) => {
			
			
			
		})
	
	return Promise.all( range( frames ).map( i => {
		
		onProgress( `${ i + 1 }/${ frames }` );
		
		console.log( `Rendering frame ${ i + 1 }/${ frames }` );
		
		var filename = `frames/${ leftPad( i, 5, '0' ) }.png`;
		
		state.update( 0, i / FRAMERATE );
		
		draw( state );
		
		var frame = composite( readGL(), canvas.toBuffer( 'raw' ) );
		
		return new Promise( resolve => {
			
			frame.write( filename, ( err, res ) => resolve( filename ) );
			
		})
		
	})).then( files => new Promise( resolve => {
		
		exec(
			`ffmpeg -r ${FRAMERATE} -i frames/%05d.png -vcodec libx264 -pix_fmt yuv420p ${file}`,
			( err, res ) => resolve( files )
		);
		
	})).then( files => Promise.all( files.map( file => new Promise( resolve => {
		
		fs.unlink( file, ( err, res ) => resolve( res ) );
		
	}))))
*/
	
/*
	var frames = Math.floor( duration * FRAMERATE );
	var currFrame = 0;
	
	var files = [];
	var writes = [];
	
	var nextFrame = () => {
		
		if ( currFrame >= frames ) return;
		
		onProgress( `${currFrame + 1}/${frames}` );
		
		console.log( `Rendering frame ${currFrame + 1}/${frames}` );
		
		draw( state );
		
		state.update( 0, currFrame / FRAMERATE );
		
		var frame = composite( readGL(), canvas.toBuffer( 'raw' ) )
		
		var filename = `frames/${ leftPad( currFrame, 5, '0' ) }.png`;
		
		writes.push( new Promise( resolve => {
			
			frame.write( filename, ( err, res ) => resolve( res ) );
			
		})
		
		files.push( filename );
		
		nextFrame();
		
	}
	
	nextFrame();
	
	return Promise.all( writes )
		.then( () => new Promise( resolve => {
			
			exec( `ffmpeg -r ${FRAMERATE} -i frames/%05d.png -vcodec libx264 -pix_fmt yuv420p ${file}`, resolve );
			
		}))
		.then( () => {
			
			return Promise.all( filenames.map( file => {
				
				fs.unlink( file, ( err, res ) => resolve( res ) )
				
			}))
			
		})
	
	
	var ffmpeg = spawn( 'ffmpeg', [
		'-y',
		'-f', 'image2pipe',
		'-r', FRAMERATE,
		'-i', '-',
		'-vcodec', 'libx264',
		'-pix_fmt', 'yuv420p',
		file
	]);
	
	var nextFrame = () => {
		
		if ( currFrame >= frames ) return Promise.resolve();
		
		onProgress( `${currFrame + 1}/${frames}` );
		
		console.log( `Rendering frame ${currFrame + 1}/${frames}` );
		
		draw( state );
		
		state.update( 0, currFrame / FRAMERATE );
		
		currFrame++;
		
		return composite( readGL(), canvas.toBuffer( 'raw' ) )
			.then( write( ffmpeg.stdin ) )
			.then( nextFrame )
	};
	
	return nextFrame().then( () => {
		
		ffmpeg.stdin.end();
						
	})
*/
	
}

module.exports = renderVideo;

var sample = {"config":{"margin":60,"size":[800,1000],"backgroundColor":[1,1,1],"textColor":[1,0,0],"cornerRadius":40,"blur":100,"fontSize":60,"debug":false},"blobs":[{"position":[543.1689453125,721.8310546875],"direction":[1,-1],"color":[1,0,0],"size":[350,350]},{"position":[393.8004455566406,584.8004150390625],"direction":[1,1],"color":[0,1,0],"size":[350,350]},{"position":[445.3066711425781,741.3067016601562],"direction":[-1,-1],"color":[0,0,1],"size":[350,350]}],"words":[{"position":0.9997423106844889},{"position":0.3333333333333333},{"position":0.5868585749130213}]}

renderVideo( 0, sample, 1, () => {} );