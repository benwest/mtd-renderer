precision highp float;

uniform vec2 resolution;
uniform vec3 background;
uniform float radius;
uniform float blur;
uniform float threshold;

uniform vec2 positions[ 3 ];
uniform vec2 sizes[ 3 ];
uniform vec3 colors[ 3 ];
uniform float blurs[ 3 ];

float maxComponent ( vec3 v ) {
    
    return max( max( v.x, v.y ), v.z );
    
}

float box ( vec2 p, vec2 position, vec2 size ) {
    
    vec2 d = abs( p - position ) - size * .5;
    
    return min( max( d.x, d.y ), 0. ) + length( max( d, 0. ) );
    
}

float roundedBox( vec2 p, vec2 position, vec2 size, float radius ) {
    
    return -( box( p, position, size - vec2( radius * 2. ) ) - radius );
    
}

void main () {
    
    vec2 p = gl_FragCoord.xy;
    
    vec3 color = vec3( 0.0 );
    
    for ( int i = 0; i < 3; i++ ) {
        
        float blobBlur = blur * blurs[ i ];
        
        float blob = roundedBox( p, positions[ i ], sizes[ i ], radius );
        
        float blurredBlob = clamp( ( blob + blobBlur ) / blobBlur, 0., 1. );
        
        color += blurredBlob * colors[ i ] * blurs[ i ];
        
    }
    
    float mask = step( 1., length( color ) );
    
    gl_FragColor = vec4( mix( background, color, mask ), 1. );
    
}