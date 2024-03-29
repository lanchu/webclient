/**
 * This RSA code from asmCrypto.js was created by doing:
 * git clone https://github.com/vibornoff/asmcrypto.js.git
 * git checkout v0.0.9
 * npm install
 * grunt --with="common,utils,exports,globals,rng,rng-exports,rng-globals,bn,bn-exports,rsa,rsa-raw,rsa-pkcs1,rsa-keygen-exports,rsa-raw-exports" devel
 */

/*! asmCrypto v0.0.9, (c) 2013 Artem S Vybornov, opensource.org/licenses/MIT */
!function ( exports, global ) {

function IllegalStateError () { var err = Error.apply( this, arguments ); this.message = err.message, this.stack = err.stack; }
IllegalStateError.prototype = Object.create( Error.prototype, { name: { value: 'IllegalStateError' } } );

function IllegalArgumentError () { var err = Error.apply( this, arguments ); this.message = err.message, this.stack = err.stack; }
IllegalArgumentError.prototype = Object.create( Error.prototype, { name: { value: 'IllegalArgumentError' } } );

function SecurityError () { var err = Error.apply( this, arguments ); this.message = err.message, this.stack = err.stack; }
SecurityError.prototype = Object.create( Error.prototype, { name: { value: 'SecurityError' } } );

var FloatArray = global.Float64Array || global.Float32Array; // make PhantomJS happy

function string_to_bytes ( str, utf8 ) {
    utf8 = !!utf8;

    var len = str.length,
        bytes = new Uint8Array( utf8 ? 4*len : len );

    for ( var i = 0, j = 0; i < len; i++ ) {
        var c = str.charCodeAt(i);

        if ( utf8 && 0xd800 <= c && c <= 0xdbff ) {
            if ( ++i >= len ) throw new Error( "Malformed string, low surrogate expected at position " + i );
            c = ( (c ^ 0xd800) << 10 ) | 0x10000 | ( str.charCodeAt(i) ^ 0xdc00 );
        }
        else if ( !utf8 && c >>> 8 ) {
            throw new Error("Wide characters are not allowed.");
        }

        if ( !utf8 || c <= 0x7f ) {
            bytes[j++] = c;
        }
        else if ( c <= 0x7ff ) {
            bytes[j++] = 0xc0 | (c >> 6);
            bytes[j++] = 0x80 | (c & 0x3f);
        }
        else if ( c <= 0xffff ) {
            bytes[j++] = 0xe0 | (c >> 12);
            bytes[j++] = 0x80 | (c >> 6 & 0x3f);
            bytes[j++] = 0x80 | (c & 0x3f);
        }
        else {
            bytes[j++] = 0xf0 | (c >> 18);
            bytes[j++] = 0x80 | (c >> 12 & 0x3f);
            bytes[j++] = 0x80 | (c >> 6 & 0x3f);
            bytes[j++] = 0x80 | (c & 0x3f);
        }
    }

    return bytes.subarray(0, j);
}

function hex_to_bytes ( str ) {
    var len = str.length;
    if ( len & 1 ) {
        str = '0'+str;
        len++;
    }
    var bytes = new Uint8Array(len>>1);
    for ( var i = 0; i < len; i += 2 ) {
        bytes[i>>1] = parseInt( str.substr( i, 2), 16 );
    }
    return bytes;
}

function base64_to_bytes ( str ) {
    return string_to_bytes( atob( str ) );
}

function bytes_to_string ( bytes, utf8 ) {
    utf8 = !!utf8;

    var len = bytes.length,
        chars = new Array(len);

    for ( var i = 0, j = 0; i < len; i++ ) {
        var b = bytes[i];
        if ( !utf8 || b < 128 ) {
            chars[j++] = b;
        }
        else if ( b >= 192 && b < 224 && i+1 < len ) {
            chars[j++] = ( (b & 0x1f) << 6 ) | (bytes[++i] & 0x3f);
        }
        else if ( b >= 224 && b < 240 && i+2 < len ) {
            chars[j++] = ( (b & 0xf) << 12 ) | ( (bytes[++i] & 0x3f) << 6 ) | (bytes[++i] & 0x3f);
        }
        else if ( b >= 240 && b < 248 && i+3 < len ) {
            var c = ( (b & 7) << 18 ) | ( (bytes[++i] & 0x3f) << 12 ) | ( (bytes[++i] & 0x3f) << 6 ) | (bytes[++i] & 0x3f);
            if ( c <= 0xffff ) {
                chars[j++] = c;
            }
            else {
                c ^= 0x10000;
                chars[j++] = 0xd800 | (c >> 10);
                chars[j++] = 0xdc00 | (c & 0x3ff);
            }
        }
        else {
            throw new Error("Malformed UTF8 character at byte offset " + i);
        }
    }

    var str = '',
        bs = 16384;
    for ( var i = 0; i < j; i += bs ) {
        str += String.fromCharCode.apply( String, chars.slice( i, i+bs <= j ? i+bs : j ) );
    }

    return str;
}

function bytes_to_hex ( arr ) {
    var str = '';
    for ( var i = 0; i < arr.length; i++ ) {
        var h = ( arr[i] & 0xff ).toString(16);
        if ( h.length < 2 ) str += '0';
        str += h;
    }
    return str;
}

function bytes_to_base64 ( arr ) {
    return btoa( bytes_to_string(arr) );
}

function pow2_ceil ( a ) {
    a -= 1;
    a |= a >>> 1;
    a |= a >>> 2;
    a |= a >>> 4;
    a |= a >>> 8;
    a |= a >>> 16;
    a += 1;
    return a;
}

function is_number ( a ) {
    return ( typeof a === 'number' );
}

function is_string ( a ) {
    return ( typeof a === 'string' );
}

function is_buffer ( a ) {
    return ( a instanceof ArrayBuffer );
}

function is_bytes ( a ) {
    return ( a instanceof Uint8Array );
}

function is_typed_array ( a ) {
    return ( a instanceof Int8Array ) || ( a instanceof Uint8Array )
        || ( a instanceof Int16Array ) || ( a instanceof Uint16Array )
        || ( a instanceof Int32Array ) || ( a instanceof Uint32Array )
        || ( a instanceof Float32Array )
        || ( a instanceof Float64Array );
}

function _heap_init ( constructor, options ) {
    var heap = options.heap,
        size = heap ? heap.byteLength : options.heapSize || 65536;

    if ( size & 0xfff || size <= 0 )
        throw new Error("heap size must be a positive integer and a multiple of 4096");

    heap = heap || new constructor( new ArrayBuffer(size) );

    return heap;
}

function _heap_write ( heap, hpos, data, dpos, dlen ) {
    var hlen = heap.length - hpos,
        wlen = ( hlen < dlen ) ? hlen : dlen;

    heap.set( data.subarray( dpos, dpos+wlen ), hpos );

    return wlen;
}

/**
 * Util exports
 */

exports.string_to_bytes = string_to_bytes;
exports.hex_to_bytes = hex_to_bytes;
exports.base64_to_bytes = base64_to_bytes;
exports.bytes_to_string = bytes_to_string;
exports.bytes_to_hex = bytes_to_hex;
exports.bytes_to_base64 = bytes_to_base64;

/**
 * Error definitions
 */

global.IllegalStateError = IllegalStateError;
global.IllegalArgumentError = IllegalArgumentError;
global.SecurityError = SecurityError;

function hash_reset () {
    this.result = null;
    this.pos = 0;
    this.len = 0;

    this.asm.reset();

    return this;
}

function hash_process ( data ) {
    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    if ( is_string(data) )
        data = string_to_bytes(data);

    if ( is_buffer(data) )
        data = new Uint8Array(data);

    if ( !is_bytes(data) )
        throw new TypeError("data isn't of expected type");

    var asm = this.asm,
        heap = this.heap,
        hpos = this.pos,
        hlen = this.len,
        dpos = 0,
        dlen = data.length,
        wlen = 0;

    while ( dlen > 0 ) {
        wlen = _heap_write( heap, hpos+hlen, data, dpos, dlen );
        hlen += wlen;
        dpos += wlen;
        dlen -= wlen;

        wlen = asm.process( hpos, hlen );

        hpos += wlen;
        hlen -= wlen;

        if ( !hlen ) hpos = 0;
    }

    this.pos = hpos;
    this.len = hlen;

    return this;
}

function hash_finish () {
    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    this.asm.finish( this.pos, this.len, 0 );

    this.result = new Uint8Array(this.HASH_SIZE);
    this.result.set( this.heap.subarray( 0, this.HASH_SIZE ) );

    this.pos = 0;
    this.len = 0;

    return this;
}

function sha256_asm ( stdlib, foreign, buffer ) {
    "use asm";

    // SHA256 state
    var H0 = 0, H1 = 0, H2 = 0, H3 = 0, H4 = 0, H5 = 0, H6 = 0, H7 = 0,
        TOTAL0 = 0, TOTAL1 = 0;

    // HMAC state
    var I0 = 0, I1 = 0, I2 = 0, I3 = 0, I4 = 0, I5 = 0, I6 = 0, I7 = 0,
        O0 = 0, O1 = 0, O2 = 0, O3 = 0, O4 = 0, O5 = 0, O6 = 0, O7 = 0;

    // I/O buffer
    var HEAP = new stdlib.Uint8Array(buffer);

    function _core ( w0, w1, w2, w3, w4, w5, w6, w7, w8, w9, w10, w11, w12, w13, w14, w15 ) {
        w0 = w0|0;
        w1 = w1|0;
        w2 = w2|0;
        w3 = w3|0;
        w4 = w4|0;
        w5 = w5|0;
        w6 = w6|0;
        w7 = w7|0;
        w8 = w8|0;
        w9 = w9|0;
        w10 = w10|0;
        w11 = w11|0;
        w12 = w12|0;
        w13 = w13|0;
        w14 = w14|0;
        w15 = w15|0;

        var a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0,
            t = 0;

        a = H0;
        b = H1;
        c = H2;
        d = H3;
        e = H4;
        f = H5;
        g = H6;
        h = H7;

        // 0
        t = ( w0 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x428a2f98 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 1
        t = ( w1 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x71374491 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 2
        t = ( w2 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xb5c0fbcf )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 3
        t = ( w3 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xe9b5dba5 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 4
        t = ( w4 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x3956c25b )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 5
        t = ( w5 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x59f111f1 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 6
        t = ( w6 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x923f82a4 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 7
        t = ( w7 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xab1c5ed5 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 8
        t = ( w8 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd807aa98 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 9
        t = ( w9 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x12835b01 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 10
        t = ( w10 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x243185be )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 11
        t = ( w11 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x550c7dc3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 12
        t = ( w12 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x72be5d74 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 13
        t = ( w13 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x80deb1fe )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 14
        t = ( w14 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x9bdc06a7 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 15
        t = ( w15 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc19bf174 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 16
        w0 = t = ( ( w1>>>7  ^ w1>>>18 ^ w1>>>3  ^ w1<<25 ^ w1<<14 ) + ( w14>>>17 ^ w14>>>19 ^ w14>>>10 ^ w14<<15 ^ w14<<13 ) + w0 + w9 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xe49b69c1 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 17
        w1 = t = ( ( w2>>>7  ^ w2>>>18 ^ w2>>>3  ^ w2<<25 ^ w2<<14 ) + ( w15>>>17 ^ w15>>>19 ^ w15>>>10 ^ w15<<15 ^ w15<<13 ) + w1 + w10 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xefbe4786 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 18
        w2 = t = ( ( w3>>>7  ^ w3>>>18 ^ w3>>>3  ^ w3<<25 ^ w3<<14 ) + ( w0>>>17 ^ w0>>>19 ^ w0>>>10 ^ w0<<15 ^ w0<<13 ) + w2 + w11 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x0fc19dc6 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 19
        w3 = t = ( ( w4>>>7  ^ w4>>>18 ^ w4>>>3  ^ w4<<25 ^ w4<<14 ) + ( w1>>>17 ^ w1>>>19 ^ w1>>>10 ^ w1<<15 ^ w1<<13 ) + w3 + w12 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x240ca1cc )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 20
        w4 = t = ( ( w5>>>7  ^ w5>>>18 ^ w5>>>3  ^ w5<<25 ^ w5<<14 ) + ( w2>>>17 ^ w2>>>19 ^ w2>>>10 ^ w2<<15 ^ w2<<13 ) + w4 + w13 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x2de92c6f )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 21
        w5 = t = ( ( w6>>>7  ^ w6>>>18 ^ w6>>>3  ^ w6<<25 ^ w6<<14 ) + ( w3>>>17 ^ w3>>>19 ^ w3>>>10 ^ w3<<15 ^ w3<<13 ) + w5 + w14 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x4a7484aa )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 22
        w6 = t = ( ( w7>>>7  ^ w7>>>18 ^ w7>>>3  ^ w7<<25 ^ w7<<14 ) + ( w4>>>17 ^ w4>>>19 ^ w4>>>10 ^ w4<<15 ^ w4<<13 ) + w6 + w15 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x5cb0a9dc )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 23
        w7 = t = ( ( w8>>>7  ^ w8>>>18 ^ w8>>>3  ^ w8<<25 ^ w8<<14 ) + ( w5>>>17 ^ w5>>>19 ^ w5>>>10 ^ w5<<15 ^ w5<<13 ) + w7 + w0 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x76f988da )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 24
        w8 = t = ( ( w9>>>7  ^ w9>>>18 ^ w9>>>3  ^ w9<<25 ^ w9<<14 ) + ( w6>>>17 ^ w6>>>19 ^ w6>>>10 ^ w6<<15 ^ w6<<13 ) + w8 + w1 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x983e5152 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 25
        w9 = t = ( ( w10>>>7  ^ w10>>>18 ^ w10>>>3  ^ w10<<25 ^ w10<<14 ) + ( w7>>>17 ^ w7>>>19 ^ w7>>>10 ^ w7<<15 ^ w7<<13 ) + w9 + w2 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa831c66d )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 26
        w10 = t = ( ( w11>>>7  ^ w11>>>18 ^ w11>>>3  ^ w11<<25 ^ w11<<14 ) + ( w8>>>17 ^ w8>>>19 ^ w8>>>10 ^ w8<<15 ^ w8<<13 ) + w10 + w3 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xb00327c8 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 27
        w11 = t = ( ( w12>>>7  ^ w12>>>18 ^ w12>>>3  ^ w12<<25 ^ w12<<14 ) + ( w9>>>17 ^ w9>>>19 ^ w9>>>10 ^ w9<<15 ^ w9<<13 ) + w11 + w4 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xbf597fc7 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 28
        w12 = t = ( ( w13>>>7  ^ w13>>>18 ^ w13>>>3  ^ w13<<25 ^ w13<<14 ) + ( w10>>>17 ^ w10>>>19 ^ w10>>>10 ^ w10<<15 ^ w10<<13 ) + w12 + w5 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc6e00bf3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 29
        w13 = t = ( ( w14>>>7  ^ w14>>>18 ^ w14>>>3  ^ w14<<25 ^ w14<<14 ) + ( w11>>>17 ^ w11>>>19 ^ w11>>>10 ^ w11<<15 ^ w11<<13 ) + w13 + w6 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd5a79147 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 30
        w14 = t = ( ( w15>>>7  ^ w15>>>18 ^ w15>>>3  ^ w15<<25 ^ w15<<14 ) + ( w12>>>17 ^ w12>>>19 ^ w12>>>10 ^ w12<<15 ^ w12<<13 ) + w14 + w7 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x06ca6351 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 31
        w15 = t = ( ( w0>>>7  ^ w0>>>18 ^ w0>>>3  ^ w0<<25 ^ w0<<14 ) + ( w13>>>17 ^ w13>>>19 ^ w13>>>10 ^ w13<<15 ^ w13<<13 ) + w15 + w8 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x14292967 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 32
        w0 = t = ( ( w1>>>7  ^ w1>>>18 ^ w1>>>3  ^ w1<<25 ^ w1<<14 ) + ( w14>>>17 ^ w14>>>19 ^ w14>>>10 ^ w14<<15 ^ w14<<13 ) + w0 + w9 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x27b70a85 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 33
        w1 = t = ( ( w2>>>7  ^ w2>>>18 ^ w2>>>3  ^ w2<<25 ^ w2<<14 ) + ( w15>>>17 ^ w15>>>19 ^ w15>>>10 ^ w15<<15 ^ w15<<13 ) + w1 + w10 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x2e1b2138 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 34
        w2 = t = ( ( w3>>>7  ^ w3>>>18 ^ w3>>>3  ^ w3<<25 ^ w3<<14 ) + ( w0>>>17 ^ w0>>>19 ^ w0>>>10 ^ w0<<15 ^ w0<<13 ) + w2 + w11 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x4d2c6dfc )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 35
        w3 = t = ( ( w4>>>7  ^ w4>>>18 ^ w4>>>3  ^ w4<<25 ^ w4<<14 ) + ( w1>>>17 ^ w1>>>19 ^ w1>>>10 ^ w1<<15 ^ w1<<13 ) + w3 + w12 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x53380d13 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 36
        w4 = t = ( ( w5>>>7  ^ w5>>>18 ^ w5>>>3  ^ w5<<25 ^ w5<<14 ) + ( w2>>>17 ^ w2>>>19 ^ w2>>>10 ^ w2<<15 ^ w2<<13 ) + w4 + w13 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x650a7354 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 37
        w5 = t = ( ( w6>>>7  ^ w6>>>18 ^ w6>>>3  ^ w6<<25 ^ w6<<14 ) + ( w3>>>17 ^ w3>>>19 ^ w3>>>10 ^ w3<<15 ^ w3<<13 ) + w5 + w14 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x766a0abb )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 38
        w6 = t = ( ( w7>>>7  ^ w7>>>18 ^ w7>>>3  ^ w7<<25 ^ w7<<14 ) + ( w4>>>17 ^ w4>>>19 ^ w4>>>10 ^ w4<<15 ^ w4<<13 ) + w6 + w15 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x81c2c92e )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 39
        w7 = t = ( ( w8>>>7  ^ w8>>>18 ^ w8>>>3  ^ w8<<25 ^ w8<<14 ) + ( w5>>>17 ^ w5>>>19 ^ w5>>>10 ^ w5<<15 ^ w5<<13 ) + w7 + w0 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x92722c85 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 40
        w8 = t = ( ( w9>>>7  ^ w9>>>18 ^ w9>>>3  ^ w9<<25 ^ w9<<14 ) + ( w6>>>17 ^ w6>>>19 ^ w6>>>10 ^ w6<<15 ^ w6<<13 ) + w8 + w1 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa2bfe8a1 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 41
        w9 = t = ( ( w10>>>7  ^ w10>>>18 ^ w10>>>3  ^ w10<<25 ^ w10<<14 ) + ( w7>>>17 ^ w7>>>19 ^ w7>>>10 ^ w7<<15 ^ w7<<13 ) + w9 + w2 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa81a664b )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 42
        w10 = t = ( ( w11>>>7  ^ w11>>>18 ^ w11>>>3  ^ w11<<25 ^ w11<<14 ) + ( w8>>>17 ^ w8>>>19 ^ w8>>>10 ^ w8<<15 ^ w8<<13 ) + w10 + w3 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc24b8b70 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 43
        w11 = t = ( ( w12>>>7  ^ w12>>>18 ^ w12>>>3  ^ w12<<25 ^ w12<<14 ) + ( w9>>>17 ^ w9>>>19 ^ w9>>>10 ^ w9<<15 ^ w9<<13 ) + w11 + w4 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc76c51a3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 44
        w12 = t = ( ( w13>>>7  ^ w13>>>18 ^ w13>>>3  ^ w13<<25 ^ w13<<14 ) + ( w10>>>17 ^ w10>>>19 ^ w10>>>10 ^ w10<<15 ^ w10<<13 ) + w12 + w5 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd192e819 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 45
        w13 = t = ( ( w14>>>7  ^ w14>>>18 ^ w14>>>3  ^ w14<<25 ^ w14<<14 ) + ( w11>>>17 ^ w11>>>19 ^ w11>>>10 ^ w11<<15 ^ w11<<13 ) + w13 + w6 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd6990624 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 46
        w14 = t = ( ( w15>>>7  ^ w15>>>18 ^ w15>>>3  ^ w15<<25 ^ w15<<14 ) + ( w12>>>17 ^ w12>>>19 ^ w12>>>10 ^ w12<<15 ^ w12<<13 ) + w14 + w7 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xf40e3585 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 47
        w15 = t = ( ( w0>>>7  ^ w0>>>18 ^ w0>>>3  ^ w0<<25 ^ w0<<14 ) + ( w13>>>17 ^ w13>>>19 ^ w13>>>10 ^ w13<<15 ^ w13<<13 ) + w15 + w8 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x106aa070 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 48
        w0 = t = ( ( w1>>>7  ^ w1>>>18 ^ w1>>>3  ^ w1<<25 ^ w1<<14 ) + ( w14>>>17 ^ w14>>>19 ^ w14>>>10 ^ w14<<15 ^ w14<<13 ) + w0 + w9 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x19a4c116 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 49
        w1 = t = ( ( w2>>>7  ^ w2>>>18 ^ w2>>>3  ^ w2<<25 ^ w2<<14 ) + ( w15>>>17 ^ w15>>>19 ^ w15>>>10 ^ w15<<15 ^ w15<<13 ) + w1 + w10 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x1e376c08 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 50
        w2 = t = ( ( w3>>>7  ^ w3>>>18 ^ w3>>>3  ^ w3<<25 ^ w3<<14 ) + ( w0>>>17 ^ w0>>>19 ^ w0>>>10 ^ w0<<15 ^ w0<<13 ) + w2 + w11 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x2748774c )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 51
        w3 = t = ( ( w4>>>7  ^ w4>>>18 ^ w4>>>3  ^ w4<<25 ^ w4<<14 ) + ( w1>>>17 ^ w1>>>19 ^ w1>>>10 ^ w1<<15 ^ w1<<13 ) + w3 + w12 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x34b0bcb5 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 52
        w4 = t = ( ( w5>>>7  ^ w5>>>18 ^ w5>>>3  ^ w5<<25 ^ w5<<14 ) + ( w2>>>17 ^ w2>>>19 ^ w2>>>10 ^ w2<<15 ^ w2<<13 ) + w4 + w13 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x391c0cb3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 53
        w5 = t = ( ( w6>>>7  ^ w6>>>18 ^ w6>>>3  ^ w6<<25 ^ w6<<14 ) + ( w3>>>17 ^ w3>>>19 ^ w3>>>10 ^ w3<<15 ^ w3<<13 ) + w5 + w14 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x4ed8aa4a )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 54
        w6 = t = ( ( w7>>>7  ^ w7>>>18 ^ w7>>>3  ^ w7<<25 ^ w7<<14 ) + ( w4>>>17 ^ w4>>>19 ^ w4>>>10 ^ w4<<15 ^ w4<<13 ) + w6 + w15 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x5b9cca4f )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 55
        w7 = t = ( ( w8>>>7  ^ w8>>>18 ^ w8>>>3  ^ w8<<25 ^ w8<<14 ) + ( w5>>>17 ^ w5>>>19 ^ w5>>>10 ^ w5<<15 ^ w5<<13 ) + w7 + w0 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x682e6ff3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 56
        w8 = t = ( ( w9>>>7  ^ w9>>>18 ^ w9>>>3  ^ w9<<25 ^ w9<<14 ) + ( w6>>>17 ^ w6>>>19 ^ w6>>>10 ^ w6<<15 ^ w6<<13 ) + w8 + w1 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x748f82ee )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 57
        w9 = t = ( ( w10>>>7  ^ w10>>>18 ^ w10>>>3  ^ w10<<25 ^ w10<<14 ) + ( w7>>>17 ^ w7>>>19 ^ w7>>>10 ^ w7<<15 ^ w7<<13 ) + w9 + w2 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x78a5636f )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 58
        w10 = t = ( ( w11>>>7  ^ w11>>>18 ^ w11>>>3  ^ w11<<25 ^ w11<<14 ) + ( w8>>>17 ^ w8>>>19 ^ w8>>>10 ^ w8<<15 ^ w8<<13 ) + w10 + w3 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x84c87814 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 59
        w11 = t = ( ( w12>>>7  ^ w12>>>18 ^ w12>>>3  ^ w12<<25 ^ w12<<14 ) + ( w9>>>17 ^ w9>>>19 ^ w9>>>10 ^ w9<<15 ^ w9<<13 ) + w11 + w4 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x8cc70208 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 60
        w12 = t = ( ( w13>>>7  ^ w13>>>18 ^ w13>>>3  ^ w13<<25 ^ w13<<14 ) + ( w10>>>17 ^ w10>>>19 ^ w10>>>10 ^ w10<<15 ^ w10<<13 ) + w12 + w5 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x90befffa )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 61
        w13 = t = ( ( w14>>>7  ^ w14>>>18 ^ w14>>>3  ^ w14<<25 ^ w14<<14 ) + ( w11>>>17 ^ w11>>>19 ^ w11>>>10 ^ w11<<15 ^ w11<<13 ) + w13 + w6 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa4506ceb )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 62
        w14 = t = ( ( w15>>>7  ^ w15>>>18 ^ w15>>>3  ^ w15<<25 ^ w15<<14 ) + ( w12>>>17 ^ w12>>>19 ^ w12>>>10 ^ w12<<15 ^ w12<<13 ) + w14 + w7 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xbef9a3f7 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 63
        w15 = t = ( ( w0>>>7  ^ w0>>>18 ^ w0>>>3  ^ w0<<25 ^ w0<<14 ) + ( w13>>>17 ^ w13>>>19 ^ w13>>>10 ^ w13<<15 ^ w13<<13 ) + w15 + w8 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc67178f2 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        H0 = ( H0 + a )|0;
        H1 = ( H1 + b )|0;
        H2 = ( H2 + c )|0;
        H3 = ( H3 + d )|0;
        H4 = ( H4 + e )|0;
        H5 = ( H5 + f )|0;
        H6 = ( H6 + g )|0;
        H7 = ( H7 + h )|0;
    }

    function _core_heap ( offset ) {
        offset = offset|0;

        _core(
            HEAP[offset|0]<<24 | HEAP[offset|1]<<16 | HEAP[offset|2]<<8 | HEAP[offset|3],
            HEAP[offset|4]<<24 | HEAP[offset|5]<<16 | HEAP[offset|6]<<8 | HEAP[offset|7],
            HEAP[offset|8]<<24 | HEAP[offset|9]<<16 | HEAP[offset|10]<<8 | HEAP[offset|11],
            HEAP[offset|12]<<24 | HEAP[offset|13]<<16 | HEAP[offset|14]<<8 | HEAP[offset|15],
            HEAP[offset|16]<<24 | HEAP[offset|17]<<16 | HEAP[offset|18]<<8 | HEAP[offset|19],
            HEAP[offset|20]<<24 | HEAP[offset|21]<<16 | HEAP[offset|22]<<8 | HEAP[offset|23],
            HEAP[offset|24]<<24 | HEAP[offset|25]<<16 | HEAP[offset|26]<<8 | HEAP[offset|27],
            HEAP[offset|28]<<24 | HEAP[offset|29]<<16 | HEAP[offset|30]<<8 | HEAP[offset|31],
            HEAP[offset|32]<<24 | HEAP[offset|33]<<16 | HEAP[offset|34]<<8 | HEAP[offset|35],
            HEAP[offset|36]<<24 | HEAP[offset|37]<<16 | HEAP[offset|38]<<8 | HEAP[offset|39],
            HEAP[offset|40]<<24 | HEAP[offset|41]<<16 | HEAP[offset|42]<<8 | HEAP[offset|43],
            HEAP[offset|44]<<24 | HEAP[offset|45]<<16 | HEAP[offset|46]<<8 | HEAP[offset|47],
            HEAP[offset|48]<<24 | HEAP[offset|49]<<16 | HEAP[offset|50]<<8 | HEAP[offset|51],
            HEAP[offset|52]<<24 | HEAP[offset|53]<<16 | HEAP[offset|54]<<8 | HEAP[offset|55],
            HEAP[offset|56]<<24 | HEAP[offset|57]<<16 | HEAP[offset|58]<<8 | HEAP[offset|59],
            HEAP[offset|60]<<24 | HEAP[offset|61]<<16 | HEAP[offset|62]<<8 | HEAP[offset|63]
        );
    }

    // offset — multiple of 32
    function _state_to_heap ( output ) {
        output = output|0;

        HEAP[output|0] = H0>>>24;
        HEAP[output|1] = H0>>>16&255;
        HEAP[output|2] = H0>>>8&255;
        HEAP[output|3] = H0&255;
        HEAP[output|4] = H1>>>24;
        HEAP[output|5] = H1>>>16&255;
        HEAP[output|6] = H1>>>8&255;
        HEAP[output|7] = H1&255;
        HEAP[output|8] = H2>>>24;
        HEAP[output|9] = H2>>>16&255;
        HEAP[output|10] = H2>>>8&255;
        HEAP[output|11] = H2&255;
        HEAP[output|12] = H3>>>24;
        HEAP[output|13] = H3>>>16&255;
        HEAP[output|14] = H3>>>8&255;
        HEAP[output|15] = H3&255;
        HEAP[output|16] = H4>>>24;
        HEAP[output|17] = H4>>>16&255;
        HEAP[output|18] = H4>>>8&255;
        HEAP[output|19] = H4&255;
        HEAP[output|20] = H5>>>24;
        HEAP[output|21] = H5>>>16&255;
        HEAP[output|22] = H5>>>8&255;
        HEAP[output|23] = H5&255;
        HEAP[output|24] = H6>>>24;
        HEAP[output|25] = H6>>>16&255;
        HEAP[output|26] = H6>>>8&255;
        HEAP[output|27] = H6&255;
        HEAP[output|28] = H7>>>24;
        HEAP[output|29] = H7>>>16&255;
        HEAP[output|30] = H7>>>8&255;
        HEAP[output|31] = H7&255;
    }

    function reset () {
        H0 = 0x6a09e667;
        H1 = 0xbb67ae85;
        H2 = 0x3c6ef372;
        H3 = 0xa54ff53a;
        H4 = 0x510e527f;
        H5 = 0x9b05688c;
        H6 = 0x1f83d9ab;
        H7 = 0x5be0cd19;
        TOTAL0 = TOTAL1 = 0;
    }

    function init ( h0, h1, h2, h3, h4, h5, h6, h7, total0, total1 ) {
        h0 = h0|0;
        h1 = h1|0;
        h2 = h2|0;
        h3 = h3|0;
        h4 = h4|0;
        h5 = h5|0;
        h6 = h6|0;
        h7 = h7|0;
        total0 = total0|0;
        total1 = total1|0;

        H0 = h0;
        H1 = h1;
        H2 = h2;
        H3 = h3;
        H4 = h4;
        H5 = h5;
        H6 = h6;
        H7 = h7;
        TOTAL0 = total0;
        TOTAL1 = total1;
    }

    // offset — multiple of 64
    function process ( offset, length ) {
        offset = offset|0;
        length = length|0;

        var hashed = 0;

        if ( offset & 63 )
            return -1;

        while ( (length|0) >= 64 ) {
            _core_heap(offset);

            offset = ( offset + 64 )|0;
            length = ( length - 64 )|0;

            hashed = ( hashed + 64 )|0;
        }

        TOTAL0 = ( TOTAL0 + hashed )|0;
        if ( TOTAL0>>>0 < hashed>>>0 ) TOTAL1 = ( TOTAL1 + 1 )|0;

        return hashed|0;
    }

    // offset — multiple of 64
    // output — multiple of 32
    function finish ( offset, length, output ) {
        offset = offset|0;
        length = length|0;
        output = output|0;

        var hashed = 0,
            i = 0;

        if ( offset & 63 )
            return -1;

        if ( ~output )
            if ( output & 31 )
                return -1;

        if ( (length|0) >= 64 ) {
            hashed = process( offset, length )|0;
            if ( (hashed|0) == -1 )
                return -1;

            offset = ( offset + hashed )|0;
            length = ( length - hashed )|0;
        }

        hashed = ( hashed + length )|0;
        TOTAL0 = ( TOTAL0 + length )|0;
        if ( TOTAL0>>>0 < length>>>0 ) TOTAL1 = ( TOTAL1 + 1 )|0;

        HEAP[offset|length] = 0x80;

        if ( (length|0) >= 56 ) {
            for ( i = (length+1)|0; (i|0) < 64; i = (i+1)|0 )
                HEAP[offset|i] = 0x00;

            _core_heap(offset);

            length = 0;

            HEAP[offset|0] = 0;
        }

        for ( i = (length+1)|0; (i|0) < 59; i = (i+1)|0 )
            HEAP[offset|i] = 0;

        HEAP[offset|56] = TOTAL1>>>21&255;
        HEAP[offset|57] = TOTAL1>>>13&255;
        HEAP[offset|58] = TOTAL1>>>5&255;
        HEAP[offset|59] = TOTAL1<<3&255 | TOTAL0>>>29;
        HEAP[offset|60] = TOTAL0>>>21&255;
        HEAP[offset|61] = TOTAL0>>>13&255;
        HEAP[offset|62] = TOTAL0>>>5&255;
        HEAP[offset|63] = TOTAL0<<3&255;
        _core_heap(offset);

        if ( ~output )
            _state_to_heap(output);

        return hashed|0;
    }

    function hmac_reset () {
        H0 = I0;
        H1 = I1;
        H2 = I2;
        H3 = I3;
        H4 = I4;
        H5 = I5;
        H6 = I6;
        H7 = I7;
        TOTAL0 = 64;
        TOTAL1 = 0;
    }

    function _hmac_opad () {
        H0 = O0;
        H1 = O1;
        H2 = O2;
        H3 = O3;
        H4 = O4;
        H5 = O5;
        H6 = O6;
        H7 = O7;
        TOTAL0 = 64;
        TOTAL1 = 0;
    }

    function hmac_init ( p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15 ) {
        p0 = p0|0;
        p1 = p1|0;
        p2 = p2|0;
        p3 = p3|0;
        p4 = p4|0;
        p5 = p5|0;
        p6 = p6|0;
        p7 = p7|0;
        p8 = p8|0;
        p9 = p9|0;
        p10 = p10|0;
        p11 = p11|0;
        p12 = p12|0;
        p13 = p13|0;
        p14 = p14|0;
        p15 = p15|0;

        // opad
        reset();
        _core(
            p0 ^ 0x5c5c5c5c,
            p1 ^ 0x5c5c5c5c,
            p2 ^ 0x5c5c5c5c,
            p3 ^ 0x5c5c5c5c,
            p4 ^ 0x5c5c5c5c,
            p5 ^ 0x5c5c5c5c,
            p6 ^ 0x5c5c5c5c,
            p7 ^ 0x5c5c5c5c,
            p8 ^ 0x5c5c5c5c,
            p9 ^ 0x5c5c5c5c,
            p10 ^ 0x5c5c5c5c,
            p11 ^ 0x5c5c5c5c,
            p12 ^ 0x5c5c5c5c,
            p13 ^ 0x5c5c5c5c,
            p14 ^ 0x5c5c5c5c,
            p15 ^ 0x5c5c5c5c
        );
        O0 = H0;
        O1 = H1;
        O2 = H2;
        O3 = H3;
        O4 = H4;
        O5 = H5;
        O6 = H6;
        O7 = H7;

        // ipad
        reset();
        _core(
            p0 ^ 0x36363636,
            p1 ^ 0x36363636,
            p2 ^ 0x36363636,
            p3 ^ 0x36363636,
            p4 ^ 0x36363636,
            p5 ^ 0x36363636,
            p6 ^ 0x36363636,
            p7 ^ 0x36363636,
            p8 ^ 0x36363636,
            p9 ^ 0x36363636,
            p10 ^ 0x36363636,
            p11 ^ 0x36363636,
            p12 ^ 0x36363636,
            p13 ^ 0x36363636,
            p14 ^ 0x36363636,
            p15 ^ 0x36363636
        );
        I0 = H0;
        I1 = H1;
        I2 = H2;
        I3 = H3;
        I4 = H4;
        I5 = H5;
        I6 = H6;
        I7 = H7;

        TOTAL0 = 64;
        TOTAL1 = 0;
    }

    // offset — multiple of 64
    // output — multiple of 32
    function hmac_finish ( offset, length, output ) {
        offset = offset|0;
        length = length|0;
        output = output|0;

        var t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0,
            hashed = 0;

        if ( offset & 63 )
            return -1;

        if ( ~output )
            if ( output & 31 )
                return -1;

        hashed = finish( offset, length, -1 )|0;
        t0 = H0, t1 = H1, t2 = H2, t3 = H3, t4 = H4, t5 = H5, t6 = H6, t7 = H7;

        _hmac_opad();
        _core( t0, t1, t2, t3, t4, t5, t6, t7, 0x80000000, 0, 0, 0, 0, 0, 0, 768 );

        if ( ~output )
            _state_to_heap(output);

        return hashed|0;
    }

    // salt is assumed to be already processed
    // offset — multiple of 64
    // output — multiple of 32
    function pbkdf2_generate_block ( offset, length, block, count, output ) {
        offset = offset|0;
        length = length|0;
        block = block|0;
        count = count|0;
        output = output|0;

        var h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0,
            t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0;

        if ( offset & 63 )
            return -1;

        if ( ~output )
            if ( output & 31 )
                return -1;

        // pad block number into heap
        // FIXME probable OOB write
        HEAP[(offset+length)|0]   = block>>>24;
        HEAP[(offset+length+1)|0] = block>>>16&255;
        HEAP[(offset+length+2)|0] = block>>>8&255;
        HEAP[(offset+length+3)|0] = block&255;

        // finish first iteration
        hmac_finish( offset, (length+4)|0, -1 )|0;
        h0 = t0 = H0, h1 = t1 = H1, h2 = t2 = H2, h3 = t3 = H3, h4 = t4 = H4, h5 = t5 = H5, h6 = t6 = H6, h7 = t7 = H7;
        count = (count-1)|0;

        // perform the rest iterations
        while ( (count|0) > 0 ) {
            hmac_reset();
            _core( t0, t1, t2, t3, t4, t5, t6, t7, 0x80000000, 0, 0, 0, 0, 0, 0, 768 );
            t0 = H0, t1 = H1, t2 = H2, t3 = H3, t4 = H4, t5 = H5, t6 = H6, t7 = H7;

            _hmac_opad();
            _core( t0, t1, t2, t3, t4, t5, t6, t7, 0x80000000, 0, 0, 0, 0, 0, 0, 768 );
            t0 = H0, t1 = H1, t2 = H2, t3 = H3, t4 = H4, t5 = H5, t6 = H6, t7 = H7;

            h0 = h0 ^ H0;
            h1 = h1 ^ H1;
            h2 = h2 ^ H2;
            h3 = h3 ^ H3;
            h4 = h4 ^ H4;
            h5 = h5 ^ H5;
            h6 = h6 ^ H6;
            h7 = h7 ^ H7;

            count = (count-1)|0;
        }

        H0 = h0;
        H1 = h1;
        H2 = h2;
        H3 = h3;
        H4 = h4;
        H5 = h5;
        H6 = h6;
        H7 = h7;

        if ( ~output )
            _state_to_heap(output);

        return 0;
    }

    return {
        // SHA256
        reset: reset,
        init: init,
        process: process,
        finish: finish,

        // HMAC-SHA256
        hmac_reset: hmac_reset,
        hmac_init: hmac_init,
        hmac_finish: hmac_finish,

        // PBKDF2-HMAC-SHA256
        pbkdf2_generate_block: pbkdf2_generate_block
    }
}

var _sha256_block_size = 64,
    _sha256_hash_size = 32;

function sha256_constructor ( options ) {
    options = options || {};

    this.heap = _heap_init( Uint8Array, options );
    this.asm = options.asm || sha256_asm( global, null, this.heap.buffer );

    this.BLOCK_SIZE = _sha256_block_size;
    this.HASH_SIZE = _sha256_hash_size;

    this.reset();
}

sha256_constructor.BLOCK_SIZE = _sha256_block_size;
sha256_constructor.HASH_SIZE = _sha256_hash_size;
var sha256_prototype = sha256_constructor.prototype;
sha256_prototype.reset =   hash_reset;
sha256_prototype.process = hash_process;
sha256_prototype.finish =  hash_finish;

var sha256_instance = null;

function get_sha256_instance () {
    if ( sha256_instance === null ) sha256_instance = new sha256_constructor( { heapSize: 0x100000 } );
    return sha256_instance;
}

function hmac_constructor ( options ) {
    options = options || {};

    if ( !options.hash )
        throw new SyntaxError("option 'hash' is required");

    if ( !options.hash.HASH_SIZE )
        throw new SyntaxError("option 'hash' supplied doesn't seem to be a valid hash function");

    this.hash = options.hash;
    this.BLOCK_SIZE = this.hash.BLOCK_SIZE;
    this.HMAC_SIZE = this.hash.HASH_SIZE;

    this.key = null;
    this.verify = null;
    this.result = null;

    if ( options.password !== undefined || options.verify !== undefined )
        this.reset(options);

    return this;
}

function _hmac_key ( hash, password ) {
    if ( is_buffer(password) )
        password = new Uint8Array(password);

    if ( is_string(password) )
        password = string_to_bytes(password);

    if ( !is_bytes(password) )
        throw new TypeError("password isn't of expected type");

    var key = new Uint8Array( hash.BLOCK_SIZE );

    if ( password.length > hash.BLOCK_SIZE ) {
        key.set( hash.reset().process(password).finish().result );
    }
    else {
        key.set(password);
    }

    return key;
}

function _hmac_init_verify ( verify ) {
    if ( is_buffer(verify) || is_bytes(verify) ) {
        verify = new Uint8Array(verify);
    }
    else if ( is_string(verify) ) {
        verify = string_to_bytes(verify);
    }
    else {
        throw new TypeError("verify tag isn't of expected type");
    }

    if ( verify.length !== this.HMAC_SIZE )
        throw new IllegalArgumentError("illegal verification tag size");

    this.verify = verify;
}

function hmac_reset ( options ) {
    options = options || {};
    var password = options.password;

    if ( this.key === null && !is_string(password) && !password )
        throw new IllegalStateError("no key is associated with the instance");

    this.result = null;
    this.hash.reset();

    if ( password || is_string(password) )
        this.key = _hmac_key( this.hash, password );

    var ipad = new Uint8Array(this.key);
    for ( var i = 0; i < ipad.length; ++i )
        ipad[i] ^= 0x36;

    this.hash.process(ipad);

    var verify = options.verify;
    if ( verify !== undefined ) {
        _hmac_init_verify.call( this, verify );
    }
    else {
        this.verify = null;
    }

    return this;
}

function hmac_process ( data ) {
    if ( this.key === null )
        throw new IllegalStateError("no key is associated with the instance");

    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    this.hash.process(data);

    return this;
}

function hmac_finish () {
    if ( this.key === null )
        throw new IllegalStateError("no key is associated with the instance");

    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    var inner_result = this.hash.finish().result;

    var opad = new Uint8Array(this.key);
    for ( var i = 0; i < opad.length; ++i )
        opad[i] ^= 0x5c;

    var verify = this.verify;
    var result = this.hash.reset().process(opad).process(inner_result).finish().result;

    if ( verify ) {
        if ( verify.length === result.length ) {
            var diff = 0;
            for ( var i = 0; i < verify.length; i++ ) {
                diff |= ( verify[i] ^ result[i] );
            }
            this.result = !diff;
        } else {
            this.result = false;
        }
    }
    else {
        this.result = result;
    }

    return this;
}

var hmac_prototype = hmac_constructor.prototype;
hmac_prototype.reset =   hmac_reset;
hmac_prototype.process = hmac_process;
hmac_prototype.finish =  hmac_finish;

function hmac_sha256_constructor ( options ) {
    options = options || {};

    if ( !( options.hash instanceof sha256_constructor ) )
        options.hash = get_sha256_instance();

    hmac_constructor.call( this, options );

    return this;
}

function hmac_sha256_reset ( options ) {
    options = options || {};

    this.result = null;
    this.hash.reset();

    var password = options.password;
    if ( password !== undefined ) {
        if ( is_string(password) )
            password = string_to_bytes(password);

        var key = this.key = _hmac_key( this.hash, password );
        this.hash.reset().asm.hmac_init(
            (key[0]<<24)|(key[1]<<16)|(key[2]<<8)|(key[3]),
            (key[4]<<24)|(key[5]<<16)|(key[6]<<8)|(key[7]),
            (key[8]<<24)|(key[9]<<16)|(key[10]<<8)|(key[11]),
            (key[12]<<24)|(key[13]<<16)|(key[14]<<8)|(key[15]),
            (key[16]<<24)|(key[17]<<16)|(key[18]<<8)|(key[19]),
            (key[20]<<24)|(key[21]<<16)|(key[22]<<8)|(key[23]),
            (key[24]<<24)|(key[25]<<16)|(key[26]<<8)|(key[27]),
            (key[28]<<24)|(key[29]<<16)|(key[30]<<8)|(key[31]),
            (key[32]<<24)|(key[33]<<16)|(key[34]<<8)|(key[35]),
            (key[36]<<24)|(key[37]<<16)|(key[38]<<8)|(key[39]),
            (key[40]<<24)|(key[41]<<16)|(key[42]<<8)|(key[43]),
            (key[44]<<24)|(key[45]<<16)|(key[46]<<8)|(key[47]),
            (key[48]<<24)|(key[49]<<16)|(key[50]<<8)|(key[51]),
            (key[52]<<24)|(key[53]<<16)|(key[54]<<8)|(key[55]),
            (key[56]<<24)|(key[57]<<16)|(key[58]<<8)|(key[59]),
            (key[60]<<24)|(key[61]<<16)|(key[62]<<8)|(key[63])
        );
    }
    else {
        this.hash.asm.hmac_reset();
    }

    var verify = options.verify;
    if ( verify !== undefined ) {
        _hmac_init_verify.call( this, verify );
    }
    else {
        this.verify = null;
    }

    return this;
}

function hmac_sha256_finish () {
    if ( this.key === null )
        throw new IllegalStateError("no key is associated with the instance");

    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    var hash = this.hash,
        asm = this.hash.asm,
        heap = this.hash.heap;

    asm.hmac_finish( hash.pos, hash.len, 0 );

    var verify = this.verify;
    var result = new Uint8Array(_sha256_hash_size);
    result.set( heap.subarray( 0, _sha256_hash_size ) );

    if ( verify ) {
        if ( verify.length === result.length ) {
            var diff = 0;
            for ( var i = 0; i < verify.length; i++ ) {
                diff |= ( verify[i] ^ result[i] );
            }
            this.result = !diff;
        } else {
            this.result = false;
        }
    }
    else {
        this.result = result;
    }

    return this;
}

hmac_sha256_constructor.BLOCK_SIZE = sha256_constructor.BLOCK_SIZE;
hmac_sha256_constructor.HMAC_SIZE = sha256_constructor.HASH_SIZE;

var hmac_sha256_prototype = hmac_sha256_constructor.prototype;
hmac_sha256_prototype.reset = hmac_sha256_reset;
hmac_sha256_prototype.process = hmac_process;
hmac_sha256_prototype.finish = hmac_sha256_finish;

var hmac_sha256_instance = null;

function get_hmac_sha256_instance () {
    if ( hmac_sha256_instance === null ) hmac_sha256_instance = new hmac_sha256_constructor();
    return hmac_sha256_instance;
}

function pbkdf2_constructor ( options ) {
    options = options || {};

    if ( !options.hmac )
        throw new SyntaxError("option 'hmac' is required");

    if ( !options.hmac.HMAC_SIZE )
        throw new SyntaxError("option 'hmac' supplied doesn't seem to be a valid HMAC function");

    this.hmac = options.hmac;
    this.count = options.count || 4096;
    this.length = options.length || this.hmac.HMAC_SIZE;

    this.result = null;

    var password = options.password;
    if ( password || is_string(password) )
        this.reset(options);

    return this;
}

function pbkdf2_reset ( options ) {
    this.result = null;

    this.hmac.reset(options);

    return this;
}

function pbkdf2_generate ( salt, count, length ) {
    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    if ( !salt && !is_string(salt) )
        throw new IllegalArgumentError("bad 'salt' value");

    count = count || this.count;
    length = length || this.length;

    this.result = new Uint8Array(length);

    var blocks = Math.ceil( length / this.hmac.HMAC_SIZE );

    for ( var i = 1; i <= blocks; ++i ) {
        var j = ( i - 1 ) * this.hmac.HMAC_SIZE;
        var l = ( i < blocks ? 0 : length % this.hmac.HMAC_SIZE ) || this.hmac.HMAC_SIZE;
        var tmp = new Uint8Array( this.hmac.reset().process(salt).process( new Uint8Array([ i>>>24&0xff, i>>>16&0xff, i>>>8&0xff, i&0xff ]) ).finish().result );
        this.result.set( tmp.subarray( 0, l ), j );
        for ( var k = 1; k < count; ++k ) {
            tmp = new Uint8Array( this.hmac.reset().process(tmp).finish().result );
            for ( var r = 0; r < l; ++r ) this.result[j+r] ^= tmp[r];
        }
    }

    return this;
}

// methods
var pbkdf2_prototype = pbkdf2_constructor.prototype;
pbkdf2_prototype.reset =   pbkdf2_reset;
pbkdf2_prototype.generate = pbkdf2_generate;

function pbkdf2_hmac_sha256_constructor ( options ) {
    options = options || {};

    if ( !( options.hmac instanceof hmac_sha256_constructor ) )
        options.hmac = get_hmac_sha256_instance();

    pbkdf2_constructor.call( this, options );

    return this;
}

function pbkdf2_hmac_sha256_generate ( salt, count, length ) {
    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    if ( !salt && !is_string(salt) )
        throw new IllegalArgumentError("bad 'salt' value");

    count = count || this.count;
    length = length || this.length;

    this.result = new Uint8Array(length);

    var blocks = Math.ceil( length / this.hmac.HMAC_SIZE );

    for ( var i = 1; i <= blocks; ++i ) {
        var j = ( i - 1 ) * this.hmac.HMAC_SIZE;
        var l = ( i < blocks ? 0 : length % this.hmac.HMAC_SIZE ) || this.hmac.HMAC_SIZE;

        this.hmac.reset().process(salt);
        this.hmac.hash.asm.pbkdf2_generate_block( this.hmac.hash.pos, this.hmac.hash.len, i, count, 0 );

        this.result.set( this.hmac.hash.heap.subarray( 0, l ), j );
    }

    return this;
}

var pbkdf2_hmac_sha256_prototype = pbkdf2_hmac_sha256_constructor.prototype;
pbkdf2_hmac_sha256_prototype.reset =   pbkdf2_reset;
pbkdf2_hmac_sha256_prototype.generate = pbkdf2_hmac_sha256_generate;

var pbkdf2_hmac_sha256_instance = null;

function get_pbkdf2_hmac_sha256_instance () {
    if ( pbkdf2_hmac_sha256_instance === null ) pbkdf2_hmac_sha256_instance = new pbkdf2_hmac_sha256_constructor();
    return pbkdf2_hmac_sha256_instance;
}

/* ----------------------------------------------------------------------
 * Copyright (c) 2014 Artem S Vybornov
 *
 * Copyright (c) 2012 Yves-Marie K. Rinquin
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * ----------------------------------------------------------------------
 *
 * ISAAC is a cryptographically secure pseudo-random number generator
 * (or CSPRNG for short) designed by Robert J. Jenkins Jr. in 1996 and
 * based on RC4. It is designed for speed and security.
 *
 * ISAAC's informations & analysis:
 *   http://burtleburtle.net/bob/rand/isaac.html
 * ISAAC's implementation details:
 *   http://burtleburtle.net/bob/rand/isaacafa.html
 *
 * ISAAC succesfully passed TestU01
 */

var ISAAC = ( function () {
    var m = new Uint32Array(256), // internal memory
        r = new Uint32Array(256), // result array
        acc = 0,              // accumulator
        brs = 0,              // last result
        cnt = 0,              // counter
        gnt = 0;              // generation counter

    /* private: randinit function, same as ISAAC reference implementation */
    function randinit() {
        var a, b, c, d, e, f, g, h;

        /* private mixing function */
        function mix () {
            a ^= b <<  11; d = (d + a)|0; b = (b + c)|0;
            b ^= c >>>  2; e = (e + b)|0; c = (c + d)|0;
            c ^= d <<   8; f = (f + c)|0; d = (d + e)|0;
            d ^= e >>> 16; g = (g + d)|0; e = (e + f)|0;
            e ^= f <<  10; h = (h + e)|0; f = (f + g)|0;
            f ^= g >>>  4; a = (a + f)|0; g = (g + h)|0;
            g ^= h <<   8; b = (b + g)|0; h = (h + a)|0;
            h ^= a >>>  9; c = (c + h)|0; a = (a + b)|0;
        }

        acc = brs = cnt = 0;

        // the golden ratio
        a = b = c = d = e = f = g = h = 0x9e3779b9;

        // scramble it
        for ( var i = 0; i < 4; i++ )
            mix();

        // mix it and combine with the internal state
        for ( var i = 0; i < 256; i += 8 ) {
            a = (a + r[i|0])|0; b = (b + r[i|1])|0;
            c = (c + r[i|2])|0; d = (d + r[i|3])|0;
            e = (e + r[i|4])|0; f = (f + r[i|5])|0;
            g = (g + r[i|6])|0; h = (h + r[i|7])|0;
            mix();
            m.set([a, b, c, d, e, f, g, h], i);
        }

        // mix it again
        for ( var i = 0; i < 256; i += 8 ) {
            a = (a + m[i|0])|0; b = (b + m[i|1])|0;
            c = (c + m[i|2])|0; d = (d + m[i|3])|0;
            e = (e + m[i|4])|0; f = (f + m[i|5])|0;
            g = (g + m[i|6])|0; h = (h + m[i|7])|0;
            mix();
            m.set([a, b, c, d, e, f, g, h], i);
        }

        // fill in the first set of results
        prng(1), gnt = 256;
    }

    /* public: seeding function */
    function seed ( s ) {
        var i, j, k, n, l;

        if ( !is_typed_array(s) ) {
            if ( is_number(s) ) {
                n = new FloatArray(1), n[0] = s;
                s = new Uint8Array(n.buffer);
            }
            else if ( is_string(s) ) {
                s = string_to_bytes(s);
            }
            else if ( is_buffer(s) ) {
                s = new Uint8Array(s);
            }
            else {
                throw new TypeError("bad seed type");
            }
        }
        else {
            s = new Uint8Array(s.buffer);
        }

        // preprocess the seed
        l = s.length;
        for ( j = 0; j < l; j += 1024 )
        {
            // xor each chunk of 1024 bytes with r, for randinit() to mix in
            for ( k = j, i = 0; ( i < 1024 ) && ( k < l ); k = j | (++i) ) {
                r[i >> 2] ^= ( s[k] << ( (i & 3) << 3 ) );
            }
            randinit();
        }
    }

    /* public: isaac generator, n = number of run */
    function prng ( n ) {
        n = n || 1;

        var i, x, y;

        while ( n-- ) {
            cnt = (cnt + 1)|0;
            brs = (brs + cnt)|0;

            for ( i = 0; i < 256; i += 4 ) {
                acc ^= acc << 13;
                acc = m[(i + 128) & 0xff] + acc | 0; x = m[i|0];
                m[i|0] = y = m[(x>>>2) & 0xff] + ( acc + brs | 0 ) | 0;
                r[i|0] = brs = m[(y>>>10) & 0xff] + x | 0;

                acc ^= acc >>> 6;
                acc = m[(i + 129) & 0xff] + acc | 0; x = m[i|1];
                m[i|1] = y = m[(x >>> 2) & 0xff] + ( acc + brs | 0 ) | 0;
                r[i|1] = brs = m[(y >>> 10) & 0xff] + x | 0;

                acc ^= acc << 2;
                acc = m[(i + 130) & 0xff] + acc | 0; x = m[i|2];
                m[i|2] = y = m[(x >>> 2) & 0xff] + ( acc + brs | 0 ) | 0;
                r[i|2] = brs = m[(y >>> 10) & 0xff] + x | 0;

                acc ^= acc >>> 16;
                acc = m[(i + 131) & 0xff] + acc | 0; x = m[i|3];
                m[i|3] = y = m[(x >>> 2) & 0xff] + (acc + brs | 0 ) | 0;
                r[i|3] = brs = m[(y >>> 10) & 0xff] + x | 0;
            }
        }
    }

    /* public: return a random number */
    function rand() {
        if ( !gnt-- )
            prng(1), gnt = 255;

        return r[gnt];
    }

    /* return class object */
    return {
        'seed':  seed,
        'prng':  prng,
        'rand':  rand
    };
})();

var _global_console = global.console,
    _global_date_now = global.Date.now,
    _global_math_random = global.Math.random,
    _global_performance = global.performance,
    _global_crypto = global.crypto || global.msCrypto,
    _global_crypto_getRandomValues;

if ( _global_crypto !== undefined )
    _global_crypto_getRandomValues = _global_crypto.getRandomValues;

var _isaac_rand = ISAAC.rand,
    _isaac_seed = ISAAC.seed,
    _isaac_counter = 0,
    _isaac_weak_seeded = false,
    _isaac_seeded = false;

var _random_estimated_entropy = 0,
    _random_required_entropy = 256,
    _random_allow_weak = false,
    _random_skip_system_rng_warning = false,
    _random_warn_callstacks = {};

var _hires_now;
if ( _global_performance !== undefined ) {
    _hires_now = function () { return 1000 * _global_performance.now() | 0 };
}
else {
    var _hires_epoch = 1000 * _global_date_now() | 0;
    _hires_now = function () { return 1000 * _global_date_now() - _hires_epoch | 0 };
}

/**
 * weak_seed
 *
 * Seeds RNG with native `crypto.getRandomValues` output or with high-resolution
 * time and single `Math.random()` value, and various other sources.
 *
 * We estimate this may give at least ~50 bits of unpredictableness,
 * but this has not been analysed thoroughly or precisely.
 */
function Random_weak_seed () {
    if ( _global_crypto !== undefined ) {
        buffer = new Uint8Array(32);
        _global_crypto_getRandomValues.call( _global_crypto, buffer );

        _isaac_seed(buffer);
    }
    else {
        // Some clarification about brute-force attack cost:
        // - entire bitcoin network operates at ~10^16 hash guesses per second;
        // - each PBKDF2 iteration requires the same number of hashing operations as bitcoin nonce guess;
        // - attacker having such a hashing power is able to break worst-case 50 bits of the randomness in ~3 hours;
        // Sounds sad though attacker having such a hashing power more likely would prefer to mine bitcoins.
        var buffer = new FloatArray(3),
            i, t;

        buffer[0] = _global_math_random();
        buffer[1] = _global_date_now();
        buffer[2] = _hires_now();

        buffer = new Uint8Array(buffer.buffer);

        var pbkdf2 = get_pbkdf2_hmac_sha256_instance();
        for ( i = 0; i < 100; i++ ) {
            buffer = pbkdf2.reset( { password: buffer } ).generate( global.location.href, 1000, 32 ).result;
            t = _hires_now();
            buffer[0] ^= t >>> 24, buffer[1] ^= t >>> 16, buffer[2] ^= t >>> 8, buffer[3] ^= t;
        }

        _isaac_seed(buffer);
    }

    _isaac_counter = 0;

    _isaac_weak_seeded = true;
}

/**
 * seed
 *
 * Seeds PRNG with supplied random values if these values have enough entropy.
 *
 * A false return value means the RNG is currently insecure; however a true
 * return value does not mean it is necessarily secure (depending on how you
 * collected the seed) though asmCrypto will be forced to assume this.
 *
 * The input buffer will be zeroed to discourage reuse. You should not copy it
 * or use it anywhere else before passing it into this function.
 *
 * **DISCLAIMER!** Seeding with a poor values is an easiest way shoot your legs, so
 * do not seed until you're know what entropy is and how to obtail high-quality random values,
 * **DO NOT SEED WITH CONSTANT VALUE! YOU'LL GET NO RANDOMNESS FROM CONSTANT!**
 */
function Random_seed ( seed ) {
    if ( !is_buffer(seed) && !is_typed_array(seed) )
        throw new TypeError("bad seed type");

    var bpos = seed.byteOffest || 0,
        blen = seed.byteLength || seed.length,
        buff = new Uint8Array( ( seed.buffer || seed ), bpos, blen );

    _isaac_seed(buff);

    _isaac_counter = 0;

    // don't let the user use these bytes again
    var nonzero = 0;
    for ( var i = 0; i < buff.length; i++ ) {
        nonzero |= buff[i];
        buff[i] = 0;
    }

    if ( nonzero !== 0 ) {
        // TODO we could make a better estimate, but half-length is a prudent
        // simple measure that seems unlikely to over-estimate
        _random_estimated_entropy += 4 * blen;
    }

    _isaac_seeded = ( _random_estimated_entropy  >= _random_required_entropy );

    return _isaac_seeded;
}

/**
 * getValues
 *
 * Populates the buffer with cryptographically secure random values. These are
 * calculated using `crypto.getRandomValues` if it is available, as well as our
 * own ISAAC PRNG implementation.
 *
 * If the former is not available (older browsers such as IE10 [1]), then the
 * latter *must* be seeded using `Random.seed`, unless `asmCrypto.random.allowWeak` is true.
 *
 * *We assume the system RNG is strong*; if you cannot afford this risk, then
 * you should also seed ISAAC using `Random.seed`. This is advisable for very
 * important situations, such as generation of long-term secrets. See also [2].
 *
 * [1] https://developer.mozilla.org/en-US/docs/Web/API/window.crypto.getRandomValues
 * [2] https://en.wikipedia.org/wiki/Dual_EC_DRBG
 *
 * In all cases, we opportunistically seed using various arbitrary sources
 * such as high-resolution time and one single value from the insecure
 * Math.random(); however this is not reliable as a strong security measure.
 */
function Random_getValues ( buffer ) {
    // opportunistically seed ISAAC with a weak seed; this hopefully makes an
    // attack harder in the case where the system RNG is weak *and* we haven't
    // seeded ISAAC. but don't make any guarantees to the user about this.
    if ( !_isaac_weak_seeded )
        Random_weak_seed();

    // if we have no strong sources then the RNG is weak, handle it
    if ( !_isaac_seeded && _global_crypto === undefined ) {
        if ( !_random_allow_weak )
            throw new SecurityError("No strong PRNGs available. Use asmCrypto.random.seed().");

        if ( _global_console !== undefined )
            _global_console.error("No strong PRNGs available; your security is greatly lowered. Use asmCrypto.random.seed().");
    }

    // separate warning about assuming system RNG strong
    if ( !_random_skip_system_rng_warning && !_isaac_seeded && _global_crypto !== undefined && _global_console !== undefined ) {
        // Hacky way to get call stack
        var s = new Error().stack;
        _random_warn_callstacks[s] |= 0;
        if ( !_random_warn_callstacks[s]++ )
            _global_console.warn("asmCrypto PRNG not seeded; your security relies on your system PRNG. If this is not acceptable, use asmCrypto.random.seed().");
    }

    // proceed to get random values
    if ( !is_buffer(buffer) && !is_typed_array(buffer) )
        throw new TypeError("unexpected buffer type");

    var bpos = buffer.byteOffset || 0,
        blen = buffer.byteLength || buffer.length,
        bytes = new Uint8Array( ( buffer.buffer || buffer ), bpos, blen ),
        i, r;

    // apply system rng
    if ( _global_crypto !== undefined )
        _global_crypto_getRandomValues.call( _global_crypto, bytes );

    // apply isaac rng
    for ( i = 0; i < blen; i++ ) {
        if ( (i & 3) === 0 ) {
            if ( _isaac_counter >= 0x10000000000 ) Random_weak_seed();
            r = _isaac_rand();
            _isaac_counter++;
        }
        bytes[i] ^= r;
        r >>>= 8;
    }

    return buffer;
}

/**
 * getNumber
 *
 * A drop-in `Math.random` replacement.
 * Intended for prevention of random material leakage out of the user's host.
 */
function Random_getNumber () {
    if ( !_isaac_weak_seeded || _isaac_counter >= 0x10000000000 )
        Random_weak_seed();

    var n = ( 0x100000 * _isaac_rand() + ( _isaac_rand() >>> 12 ) ) / 0x10000000000000;
    _isaac_counter += 2;

    return n;
}

exports.random = Random_getNumber;

exports.random.seed = Random_seed;

Object.defineProperty( Random_getNumber, 'allowWeak', {
    get: function () { return _random_allow_weak; },
    set: function ( a ) { _random_allow_weak = a; }
});

Object.defineProperty( Random_getNumber, 'skipSystemRNGWarning', {
    get: function () { return _random_skip_system_rng_warning; },
    set: function ( w ) { _random_skip_system_rng_warning = w; }
});

exports.getRandomValues = Random_getValues;

exports.getRandomValues.seed = Random_seed;

Object.defineProperty( Random_getValues, 'allowWeak', {
    get: function () { return _random_allow_weak; },
    set: function ( a ) { _random_allow_weak = a; }
});

Object.defineProperty( Random_getValues, 'skipSystemRNGWarning', {
    get: function () { return _random_skip_system_rng_warning; },
    set: function ( w ) { _random_skip_system_rng_warning = w; }
});

global.Math.random = Random_getNumber;

if ( global.crypto === undefined ) global.crypto = {};
global.crypto.getRandomValues = Random_getValues;

var bigint_asm;

if ( global.Math.imul === undefined ) {
    function _half_imul ( a, b ) {
        return a * b | 0;
    }
    bigint_asm = function ( stdlib, foreign, buffer ) {
        global.Math.imul = _half_imul;
        var m = _bigint_asm( stdlib, foreign, buffer );
        delete global.Math.imul;
        return m;
    };
}
else {
    bigint_asm = _bigint_asm;
}

/**
 * Integers are represented as little endian array of 32-bit limbs.
 * Limbs number is a power of 2 and a multiple of 8 (256 bits).
 * Negative values use two's complement representation.
 */
function _bigint_asm ( stdlib, foreign, buffer ) {
    "use asm";

    var SP = 0;

    var HEAP32 = new stdlib.Uint32Array(buffer);

    var imul = stdlib.Math.imul;

    /**
     * Simple stack memory allocator
     *
     * Methods:
     *  sreset
     *  salloc
     *  sfree
     */

    function sreset ( p ) {
        p = p|0;
        SP = p = (p + 31) & -32;
        return p|0;
    }

    function salloc ( l ) {
        l = l|0;
        var p = 0; p = SP;
        SP = p + ((l + 31) & -32)|0;
        return p|0;
    }

    function sfree ( l ) {
        l = l|0;
        SP = SP - ((l + 31) & -32)|0;
    }

    /**
     * Utility functions:
     *  cp
     *  z
     */

    function cp ( l, A, B ) {
        l = l|0;
        A = A|0;
        B = B|0;

        var i = 0;

        if ( (A|0) > (B|0) ) {
            for ( ; (i|0) < (l|0); i = (i+4)|0 ) {
                HEAP32[(B+i)>>2] = HEAP32[(A+i)>>2];
            }
        }
        else {
            for ( i = (l-4)|0; (i|0) >= 0; i = (i-4)|0 ) {
                HEAP32[(B+i)>>2] = HEAP32[(A+i)>>2];
            }
        }
    }

    function z ( l, z, A ) {
        l = l|0;
        z = z|0;
        A = A|0;

        var i = 0;

        for ( ; (i|0) < (l|0); i = (i+4)|0 ) {
            HEAP32[(A+i)>>2] = z;
        }
    }

    /**
     * Negate the argument
     *
     * Perform two's complement transformation:
     *
     *  -A = ~A + 1
     *
     * @param A offset of the argment being negated, 32-byte aligned
     * @param lA length of the argument, multiple of 32
     *
     * @param R offset where to place the result to, 32-byte aligned
     * @param lR length to truncate the result to, multiple of 32
     */
    function neg ( A, lA, R, lR ) {
        A  =  A|0;
        lA = lA|0;
        R  =  R|0;
        lR = lR|0;

        var a = 0, c = 0, t = 0, r = 0, i = 0;

        if ( (lR|0) <= 0 )
            lR = lA;

        if ( (lR|0) < (lA|0) )
            lA = lR;

        c = 1;
        for ( ; (i|0) < (lA|0); i = (i+4)|0 ) {
            a = ~HEAP32[(A+i)>>2];
            t = (a & 0xffff) + c|0;
            r = (a >>> 16) + (t >>> 16)|0;
            HEAP32[(R+i)>>2] = (r << 16) | (t & 0xffff);
            c = r >>> 16;
        }

        for ( ; (i|0) < (lR|0); i = (i+4)|0 ) {
            HEAP32[(R+i)>>2] = (c-1)|0;
        }

        return c|0;
    }

    function cmp ( A, lA, B, lB ) {
        A  =  A|0;
        lA = lA|0;
        B  =  B|0;
        lB = lB|0;

        var a = 0, b = 0, i = 0;

        if ( (lA|0) > (lB|0) ) {
            for ( i = (lA-4)|0; (i|0) >= (lB|0); i = (i-4)|0 ) {
                if ( HEAP32[(A+i)>>2]|0 ) return 1;
            }
        }
        else {
            for ( i = (lB-4)|0; (i|0) >= (lA|0); i = (i-4)|0 ) {
                if ( HEAP32[(B+i)>>2]|0 ) return -1;
            }
        }

        for ( ; (i|0) >= 0; i = (i-4)|0 ) {
            a = HEAP32[(A+i)>>2]|0, b = HEAP32[(B+i)>>2]|0;
            if ( (a>>>0) < (b>>>0) ) return -1;
            if ( (a>>>0) > (b>>>0) ) return 1;
        }

        return 0;
    }

    /**
     * Test the argument
     *
     * Same as `cmp` with zero.
     */
    function tst ( A, lA ) {
        A  =  A|0;
        lA = lA|0;

        var i = 0;

        for ( i = (lA-4)|0; (i|0) >= 0; i = (i-4)|0 ) {
            if ( HEAP32[(A+i)>>2]|0 ) return (i+4)|0;
        }

        return 0;
    }

    /**
     * Conventional addition
     *
     * @param A offset of the first argument, 32-byte aligned
     * @param lA length of the first argument, multiple of 32
     *
     * @param B offset of the second argument, 32-bit aligned
     * @param lB length of the second argument, multiple of 32
     *
     * @param R offset where to place the result to, 32-byte aligned
     * @param lR length to truncate the result to, multiple of 32
     */
    function add ( A, lA, B, lB, R, lR ) {
        A  =  A|0;
        lA = lA|0;
        B  =  B|0;
        lB = lB|0;
        R  =  R|0;
        lR = lR|0;

        var a = 0, b = 0, c = 0, t = 0, r = 0, i = 0;

        if ( (lA|0) < (lB|0) ) {
            t = A, A = B, B = t;
            t = lA, lA = lB, lB = t;
        }

        if ( (lR|0) <= 0 )
            lR = lA+4|0;

        if ( (lR|0) < (lB|0) )
            lA = lB = lR;

        for ( ; (i|0) < (lB|0); i = (i+4)|0 ) {
            a = HEAP32[(A+i)>>2]|0;
            b = HEAP32[(B+i)>>2]|0;
            t = ( (a & 0xffff) + (b & 0xffff)|0 ) + c|0;
            r = ( (a >>> 16) + (b >>> 16)|0 ) + (t >>> 16)|0;
            HEAP32[(R+i)>>2] = (t & 0xffff) | (r << 16);
            c = r >>> 16;
        }

        for ( ; (i|0) < (lA|0); i = (i+4)|0 ) {
            a = HEAP32[(A+i)>>2]|0;
            t = (a & 0xffff) + c|0;
            r = (a >>> 16) + (t >>> 16)|0;
            HEAP32[(R+i)>>2] = (t & 0xffff) | (r << 16);
            c = r >>> 16;
        }

        for ( ; (i|0) < (lR|0); i = (i+4)|0 ) {
            HEAP32[(R+i)>>2] = c|0;
            c = 0;
        }

        return c|0;
    }

   /**
     * Conventional subtraction
     *
     * @param A offset of the first argument, 32-byte aligned
     * @param lA length of the first argument, multiple of 32
     *
     * @param B offset of the second argument, 32-bit aligned
     * @param lB length of the second argument, multiple of 32
     *
     * @param R offset where to place the result to, 32-byte aligned
     * @param lR length to truncate the result to, multiple of 32
     */
    function sub ( A, lA, B, lB, R, lR ) {
        A  =  A|0;
        lA = lA|0;
        B  =  B|0;
        lB = lB|0;
        R  =  R|0;
        lR = lR|0;

        var a = 0, b = 0, c = 0, t = 0, r = 0, i = 0;

        if ( (lR|0) <= 0 )
            lR = (lA|0) > (lB|0) ? lA+4|0 : lB+4|0;

        if ( (lR|0) < (lA|0) )
            lA = lR;

        if ( (lR|0) < (lB|0) )
            lB = lR;

        if ( (lA|0) < (lB|0) ) {
            for ( ; (i|0) < (lA|0); i = (i+4)|0 ) {
                a = HEAP32[(A+i)>>2]|0;
                b = HEAP32[(B+i)>>2]|0;
                t = ( (a & 0xffff) - (b & 0xffff)|0 ) + c|0;
                r = ( (a >>> 16) - (b >>> 16)|0 ) + (t >> 16)|0;
                HEAP32[(R+i)>>2] = (t & 0xffff) | (r << 16);
                c = r >> 16;
            }

            for ( ; (i|0) < (lB|0); i = (i+4)|0 ) {
                b = HEAP32[(B+i)>>2]|0;
                t = c - (b & 0xffff)|0;
                r = (t >> 16) - (b >>> 16)|0;
                HEAP32[(R+i)>>2] = (t & 0xffff) | (r << 16);
                c = r >> 16;
            }
        }
        else {
            for ( ; (i|0) < (lB|0); i = (i+4)|0 ) {
                a = HEAP32[(A+i)>>2]|0;
                b = HEAP32[(B+i)>>2]|0;
                t = ( (a & 0xffff) - (b & 0xffff)|0 ) + c|0;
                r = ( (a >>> 16) - (b >>> 16)|0 ) + (t >> 16)|0;
                HEAP32[(R+i)>>2] = (t & 0xffff) | (r << 16);
                c = r >> 16;
            }

            for ( ; (i|0) < (lA|0); i = (i+4)|0 ) {
                a = HEAP32[(A+i)>>2]|0;
                t = (a & 0xffff) + c|0;
                r = (a >>> 16) + (t >> 16)|0;
                HEAP32[(R+i)>>2] = (t & 0xffff) | (r << 16);
                c = r >> 16;
            }
        }

        for ( ; (i|0) < (lR|0); i = (i+4)|0 ) {
            HEAP32[(R+i)>>2] = c|0;
        }

        return c|0;
    }

    /**
     * Conventional multiplication
     *
     * TODO implement Karatsuba algorithm for large multiplicands
     *
     * @param A offset of the first argument, 32-byte aligned
     * @param lA length of the first argument, multiple of 32
     *
     * @param B offset of the second argument, 32-byte aligned
     * @param lB length of the second argument, multiple of 32
     *
     * @param R offset where to place the result to, 32-byte aligned
     * @param lR length to truncate the result to, multiple of 32
     */
    function mul ( A, lA, B, lB, R, lR ) {
        A  =  A|0;
        lA = lA|0;
        B  =  B|0;
        lB = lB|0;
        R  =  R|0;
        lR = lR|0;

        var al0 = 0, al1 = 0, al2 = 0, al3 = 0, al4 = 0, al5 = 0, al6 = 0, al7 = 0, ah0 = 0, ah1 = 0, ah2 = 0, ah3 = 0, ah4 = 0, ah5 = 0, ah6 = 0, ah7 = 0,
            bl0 = 0, bl1 = 0, bl2 = 0, bl3 = 0, bl4 = 0, bl5 = 0, bl6 = 0, bl7 = 0, bh0 = 0, bh1 = 0, bh2 = 0, bh3 = 0, bh4 = 0, bh5 = 0, bh6 = 0, bh7 = 0,
            r0 = 0, r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0, r6 = 0, r7 = 0, r8 = 0, r9 = 0, r10 = 0, r11 = 0, r12 = 0, r13 = 0, r14 = 0, r15 = 0,
            u = 0, v = 0, w = 0, m = 0,
            i = 0, Ai = 0, j = 0, Bj = 0, Rk = 0;

        if ( (lA|0) > (lB|0) ) {
            u = A, v = lA;
            A = B, lA = lB;
            B = u, lB = v;
        }

        m = (lA+lB)|0;
        if ( ( (lR|0) > (m|0) ) | ( (lR|0) <= 0 ) )
            lR = m;

        if ( (lR|0) < (lA|0) )
            lA = lR;

        if ( (lR|0) < (lB|0) )
            lB = lR;

        for ( ; (i|0) < (lA|0); i = (i+32)|0 ) {
            Ai = (A+i)|0;

            ah0 = HEAP32[(Ai|0)>>2]|0,
            ah1 = HEAP32[(Ai|4)>>2]|0,
            ah2 = HEAP32[(Ai|8)>>2]|0,
            ah3 = HEAP32[(Ai|12)>>2]|0,
            ah4 = HEAP32[(Ai|16)>>2]|0,
            ah5 = HEAP32[(Ai|20)>>2]|0,
            ah6 = HEAP32[(Ai|24)>>2]|0,
            ah7 = HEAP32[(Ai|28)>>2]|0,
            al0 = ah0 & 0xffff,
            al1 = ah1 & 0xffff,
            al2 = ah2 & 0xffff,
            al3 = ah3 & 0xffff,
            al4 = ah4 & 0xffff,
            al5 = ah5 & 0xffff,
            al6 = ah6 & 0xffff,
            al7 = ah7 & 0xffff,
            ah0 = ah0 >>> 16,
            ah1 = ah1 >>> 16,
            ah2 = ah2 >>> 16,
            ah3 = ah3 >>> 16,
            ah4 = ah4 >>> 16,
            ah5 = ah5 >>> 16,
            ah6 = ah6 >>> 16,
            ah7 = ah7 >>> 16;

            r8 = r9 = r10 = r11 = r12 = r13 = r14 = r15 = 0;

            for ( j = 0; (j|0) < (lB|0); j = (j+32)|0 ) {
                Bj = (B+j)|0;
                Rk = (R+(i+j|0))|0;

                bh0 = HEAP32[(Bj|0)>>2]|0,
                bh1 = HEAP32[(Bj|4)>>2]|0,
                bh2 = HEAP32[(Bj|8)>>2]|0,
                bh3 = HEAP32[(Bj|12)>>2]|0,
                bh4 = HEAP32[(Bj|16)>>2]|0,
                bh5 = HEAP32[(Bj|20)>>2]|0,
                bh6 = HEAP32[(Bj|24)>>2]|0,
                bh7 = HEAP32[(Bj|28)>>2]|0,
                bl0 = bh0 & 0xffff,
                bl1 = bh1 & 0xffff,
                bl2 = bh2 & 0xffff,
                bl3 = bh3 & 0xffff,
                bl4 = bh4 & 0xffff,
                bl5 = bh5 & 0xffff,
                bl6 = bh6 & 0xffff,
                bl7 = bh7 & 0xffff,
                bh0 = bh0 >>> 16,
                bh1 = bh1 >>> 16,
                bh2 = bh2 >>> 16,
                bh3 = bh3 >>> 16,
                bh4 = bh4 >>> 16,
                bh5 = bh5 >>> 16,
                bh6 = bh6 >>> 16,
                bh7 = bh7 >>> 16;

                r0 = HEAP32[(Rk|0)>>2]|0,
                r1 = HEAP32[(Rk|4)>>2]|0,
                r2 = HEAP32[(Rk|8)>>2]|0,
                r3 = HEAP32[(Rk|12)>>2]|0,
                r4 = HEAP32[(Rk|16)>>2]|0,
                r5 = HEAP32[(Rk|20)>>2]|0,
                r6 = HEAP32[(Rk|24)>>2]|0,
                r7 = HEAP32[(Rk|28)>>2]|0;

                u = ((imul(al0, bl0)|0) + (r8 & 0xffff)|0) + (r0 & 0xffff)|0;
                v = ((imul(ah0, bl0)|0) + (r8 >>> 16)|0) + (r0 >>> 16)|0;
                w = ((imul(al0, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r0 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl1)|0) + (m & 0xffff)|0) + (r1 & 0xffff)|0;
                v = ((imul(ah0, bl1)|0) + (m >>> 16)|0) + (r1 >>> 16)|0;
                w = ((imul(al0, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r1 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl2)|0) + (m & 0xffff)|0) + (r2 & 0xffff)|0;
                v = ((imul(ah0, bl2)|0) + (m >>> 16)|0) + (r2 >>> 16)|0;
                w = ((imul(al0, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r2 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl3)|0) + (m & 0xffff)|0) + (r3 & 0xffff)|0;
                v = ((imul(ah0, bl3)|0) + (m >>> 16)|0) + (r3 >>> 16)|0;
                w = ((imul(al0, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r3 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl4)|0) + (m & 0xffff)|0) + (r4 & 0xffff)|0;
                v = ((imul(ah0, bl4)|0) + (m >>> 16)|0) + (r4 >>> 16)|0;
                w = ((imul(al0, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r4 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl5)|0) + (m & 0xffff)|0) + (r5 & 0xffff)|0;
                v = ((imul(ah0, bl5)|0) + (m >>> 16)|0) + (r5 >>> 16)|0;
                w = ((imul(al0, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r5 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl6)|0) + (m & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah0, bl6)|0) + (m >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al0, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al0, bl7)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah0, bl7)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al0, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                r8 = m;

                u = ((imul(al1, bl0)|0) + (r9 & 0xffff)|0) + (r1 & 0xffff)|0;
                v = ((imul(ah1, bl0)|0) + (r9 >>> 16)|0) + (r1 >>> 16)|0;
                w = ((imul(al1, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r1 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl1)|0) + (m & 0xffff)|0) + (r2 & 0xffff)|0;
                v = ((imul(ah1, bl1)|0) + (m >>> 16)|0) + (r2 >>> 16)|0;
                w = ((imul(al1, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r2 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl2)|0) + (m & 0xffff)|0) + (r3 & 0xffff)|0;
                v = ((imul(ah1, bl2)|0) + (m >>> 16)|0) + (r3 >>> 16)|0;
                w = ((imul(al1, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r3 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl3)|0) + (m & 0xffff)|0) + (r4 & 0xffff)|0;
                v = ((imul(ah1, bl3)|0) + (m >>> 16)|0) + (r4 >>> 16)|0;
                w = ((imul(al1, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r4 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl4)|0) + (m & 0xffff)|0) + (r5 & 0xffff)|0;
                v = ((imul(ah1, bl4)|0) + (m >>> 16)|0) + (r5 >>> 16)|0;
                w = ((imul(al1, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r5 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl5)|0) + (m & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah1, bl5)|0) + (m >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al1, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl6)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah1, bl6)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al1, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al1, bl7)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah1, bl7)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al1, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah1, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                r9 = m;

                u = ((imul(al2, bl0)|0) + (r10 & 0xffff)|0) + (r2 & 0xffff)|0;
                v = ((imul(ah2, bl0)|0) + (r10 >>> 16)|0) + (r2 >>> 16)|0;
                w = ((imul(al2, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r2 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl1)|0) + (m & 0xffff)|0) + (r3 & 0xffff)|0;
                v = ((imul(ah2, bl1)|0) + (m >>> 16)|0) + (r3 >>> 16)|0;
                w = ((imul(al2, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r3 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl2)|0) + (m & 0xffff)|0) + (r4 & 0xffff)|0;
                v = ((imul(ah2, bl2)|0) + (m >>> 16)|0) + (r4 >>> 16)|0;
                w = ((imul(al2, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r4 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl3)|0) + (m & 0xffff)|0) + (r5 & 0xffff)|0;
                v = ((imul(ah2, bl3)|0) + (m >>> 16)|0) + (r5 >>> 16)|0;
                w = ((imul(al2, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r5 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl4)|0) + (m & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah2, bl4)|0) + (m >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al2, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl5)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah2, bl5)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al2, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl6)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah2, bl6)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al2, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                u = ((imul(al2, bl7)|0) + (m & 0xffff)|0) + (r9 & 0xffff)|0;
                v = ((imul(ah2, bl7)|0) + (m >>> 16)|0) + (r9 >>> 16)|0;
                w = ((imul(al2, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah2, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r9 = (w << 16) | (u & 0xffff);

                r10 = m;

                u = ((imul(al3, bl0)|0) + (r11 & 0xffff)|0) + (r3 & 0xffff)|0;
                v = ((imul(ah3, bl0)|0) + (r11 >>> 16)|0) + (r3 >>> 16)|0;
                w = ((imul(al3, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r3 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl1)|0) + (m & 0xffff)|0) + (r4 & 0xffff)|0;
                v = ((imul(ah3, bl1)|0) + (m >>> 16)|0) + (r4 >>> 16)|0;
                w = ((imul(al3, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r4 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl2)|0) + (m & 0xffff)|0) + (r5 & 0xffff)|0;
                v = ((imul(ah3, bl2)|0) + (m >>> 16)|0) + (r5 >>> 16)|0;
                w = ((imul(al3, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r5 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl3)|0) + (m & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah3, bl3)|0) + (m >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al3, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl4)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah3, bl4)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al3, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl5)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah3, bl5)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al3, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl6)|0) + (m & 0xffff)|0) + (r9 & 0xffff)|0;
                v = ((imul(ah3, bl6)|0) + (m >>> 16)|0) + (r9 >>> 16)|0;
                w = ((imul(al3, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r9 = (w << 16) | (u & 0xffff);

                u = ((imul(al3, bl7)|0) + (m & 0xffff)|0) + (r10 & 0xffff)|0;
                v = ((imul(ah3, bl7)|0) + (m >>> 16)|0) + (r10 >>> 16)|0;
                w = ((imul(al3, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah3, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r10 = (w << 16) | (u & 0xffff);

                r11 = m;

                u = ((imul(al4, bl0)|0) + (r12 & 0xffff)|0) + (r4 & 0xffff)|0;
                v = ((imul(ah4, bl0)|0) + (r12 >>> 16)|0) + (r4 >>> 16)|0;
                w = ((imul(al4, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r4 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl1)|0) + (m & 0xffff)|0) + (r5 & 0xffff)|0;
                v = ((imul(ah4, bl1)|0) + (m >>> 16)|0) + (r5 >>> 16)|0;
                w = ((imul(al4, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r5 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl2)|0) + (m & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah4, bl2)|0) + (m >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al4, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl3)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah4, bl3)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al4, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl4)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah4, bl4)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al4, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl5)|0) + (m & 0xffff)|0) + (r9 & 0xffff)|0;
                v = ((imul(ah4, bl5)|0) + (m >>> 16)|0) + (r9 >>> 16)|0;
                w = ((imul(al4, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r9 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl6)|0) + (m & 0xffff)|0) + (r10 & 0xffff)|0;
                v = ((imul(ah4, bl6)|0) + (m >>> 16)|0) + (r10 >>> 16)|0;
                w = ((imul(al4, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r10 = (w << 16) | (u & 0xffff);

                u = ((imul(al4, bl7)|0) + (m & 0xffff)|0) + (r11 & 0xffff)|0;
                v = ((imul(ah4, bl7)|0) + (m >>> 16)|0) + (r11 >>> 16)|0;
                w = ((imul(al4, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah4, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r11 = (w << 16) | (u & 0xffff);

                r12 = m;

                u = ((imul(al5, bl0)|0) + (r13 & 0xffff)|0) + (r5 & 0xffff)|0;
                v = ((imul(ah5, bl0)|0) + (r13 >>> 16)|0) + (r5 >>> 16)|0;
                w = ((imul(al5, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r5 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl1)|0) + (m & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah5, bl1)|0) + (m >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al5, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl2)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah5, bl2)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al5, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl3)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah5, bl3)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al5, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl4)|0) + (m & 0xffff)|0) + (r9 & 0xffff)|0;
                v = ((imul(ah5, bl4)|0) + (m >>> 16)|0) + (r9 >>> 16)|0;
                w = ((imul(al5, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r9 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl5)|0) + (m & 0xffff)|0) + (r10 & 0xffff)|0;
                v = ((imul(ah5, bl5)|0) + (m >>> 16)|0) + (r10 >>> 16)|0;
                w = ((imul(al5, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r10 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl6)|0) + (m & 0xffff)|0) + (r11 & 0xffff)|0;
                v = ((imul(ah5, bl6)|0) + (m >>> 16)|0) + (r11 >>> 16)|0;
                w = ((imul(al5, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r11 = (w << 16) | (u & 0xffff);

                u = ((imul(al5, bl7)|0) + (m & 0xffff)|0) + (r12 & 0xffff)|0;
                v = ((imul(ah5, bl7)|0) + (m >>> 16)|0) + (r12 >>> 16)|0;
                w = ((imul(al5, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah5, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r12 = (w << 16) | (u & 0xffff);

                r13 = m;

                u = ((imul(al6, bl0)|0) + (r14 & 0xffff)|0) + (r6 & 0xffff)|0;
                v = ((imul(ah6, bl0)|0) + (r14 >>> 16)|0) + (r6 >>> 16)|0;
                w = ((imul(al6, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r6 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl1)|0) + (m & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah6, bl1)|0) + (m >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al6, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl2)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah6, bl2)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al6, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl3)|0) + (m & 0xffff)|0) + (r9 & 0xffff)|0;
                v = ((imul(ah6, bl3)|0) + (m >>> 16)|0) + (r9 >>> 16)|0;
                w = ((imul(al6, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r9 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl4)|0) + (m & 0xffff)|0) + (r10 & 0xffff)|0;
                v = ((imul(ah6, bl4)|0) + (m >>> 16)|0) + (r10 >>> 16)|0;
                w = ((imul(al6, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r10 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl5)|0) + (m & 0xffff)|0) + (r11 & 0xffff)|0;
                v = ((imul(ah6, bl5)|0) + (m >>> 16)|0) + (r11 >>> 16)|0;
                w = ((imul(al6, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r11 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl6)|0) + (m & 0xffff)|0) + (r12 & 0xffff)|0;
                v = ((imul(ah6, bl6)|0) + (m >>> 16)|0) + (r12 >>> 16)|0;
                w = ((imul(al6, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r12 = (w << 16) | (u & 0xffff);

                u = ((imul(al6, bl7)|0) + (m & 0xffff)|0) + (r13 & 0xffff)|0;
                v = ((imul(ah6, bl7)|0) + (m >>> 16)|0) + (r13 >>> 16)|0;
                w = ((imul(al6, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah6, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r13 = (w << 16) | (u & 0xffff);

                r14 = m;

                u = ((imul(al7, bl0)|0) + (r15 & 0xffff)|0) + (r7 & 0xffff)|0;
                v = ((imul(ah7, bl0)|0) + (r15 >>> 16)|0) + (r7 >>> 16)|0;
                w = ((imul(al7, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r7 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl1)|0) + (m & 0xffff)|0) + (r8 & 0xffff)|0;
                v = ((imul(ah7, bl1)|0) + (m >>> 16)|0) + (r8 >>> 16)|0;
                w = ((imul(al7, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r8 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl2)|0) + (m & 0xffff)|0) + (r9 & 0xffff)|0;
                v = ((imul(ah7, bl2)|0) + (m >>> 16)|0) + (r9 >>> 16)|0;
                w = ((imul(al7, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r9 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl3)|0) + (m & 0xffff)|0) + (r10 & 0xffff)|0;
                v = ((imul(ah7, bl3)|0) + (m >>> 16)|0) + (r10 >>> 16)|0;
                w = ((imul(al7, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r10 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl4)|0) + (m & 0xffff)|0) + (r11 & 0xffff)|0;
                v = ((imul(ah7, bl4)|0) + (m >>> 16)|0) + (r11 >>> 16)|0;
                w = ((imul(al7, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r11 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl5)|0) + (m & 0xffff)|0) + (r12 & 0xffff)|0;
                v = ((imul(ah7, bl5)|0) + (m >>> 16)|0) + (r12 >>> 16)|0;
                w = ((imul(al7, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r12 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl6)|0) + (m & 0xffff)|0) + (r13 & 0xffff)|0;
                v = ((imul(ah7, bl6)|0) + (m >>> 16)|0) + (r13 >>> 16)|0;
                w = ((imul(al7, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r13 = (w << 16) | (u & 0xffff);

                u = ((imul(al7, bl7)|0) + (m & 0xffff)|0) + (r14 & 0xffff)|0;
                v = ((imul(ah7, bl7)|0) + (m >>> 16)|0) + (r14 >>> 16)|0;
                w = ((imul(al7, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah7, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r14 = (w << 16) | (u & 0xffff);

                r15 = m;

                HEAP32[(Rk|0)>>2] = r0,
                HEAP32[(Rk|4)>>2] = r1,
                HEAP32[(Rk|8)>>2] = r2,
                HEAP32[(Rk|12)>>2] = r3,
                HEAP32[(Rk|16)>>2] = r4,
                HEAP32[(Rk|20)>>2] = r5,
                HEAP32[(Rk|24)>>2] = r6,
                HEAP32[(Rk|28)>>2] = r7;
            }

            Rk = (R+(i+j|0))|0;
            HEAP32[(Rk|0)>>2] = r8,
            HEAP32[(Rk|4)>>2] = r9,
            HEAP32[(Rk|8)>>2] = r10,
            HEAP32[(Rk|12)>>2] = r11,
            HEAP32[(Rk|16)>>2] = r12,
            HEAP32[(Rk|20)>>2] = r13,
            HEAP32[(Rk|24)>>2] = r14,
            HEAP32[(Rk|28)>>2] = r15;
        }
/*
        for ( i = lA & -32; (i|0) < (lA|0); i = (i+4)|0 ) {
            Ai = (A+i)|0;

            ah0 = HEAP32[Ai>>2]|0,
            al0 = ah0 & 0xffff,
            ah0 = ah0 >>> 16;

            r1 = 0;

            for ( j = 0; (j|0) < (lB|0); j = (j+4)|0 ) {
                Bj = (B+j)|0;
                Rk = (R+(i+j|0))|0;

                bh0 = HEAP32[Bj>>2]|0,
                bl0 = bh0 & 0xffff,
                bh0 = bh0 >>> 16;

                r0 = HEAP32[Rk>>2]|0;

                u = ((imul(al0, bl0)|0) + (r1 & 0xffff)|0) + (r0 & 0xffff)|0;
                v = ((imul(ah0, bl0)|0) + (r1 >>> 16)|0) + (r0 >>> 16)|0;
                w = ((imul(al0, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                m = ((imul(ah0, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                r0 = (w << 16) | (u & 0xffff);

                r1 = m;

                HEAP32[Rk>>2] = r0;
            }

            Rk = (R+(i+j|0))|0;
            HEAP32[Rk>>2] = r1;
        }
*/
    }

    /**
     * Fast squaring
     *
     * Exploits the fact:
     *
     *  X² = ( X0 + X1*B )² = X0² + 2*X0*X1*B + X1²*B²,
     *
     * where B is a power of 2, so:
     *
     *  2*X0*X1*B = (X0*X1 << 1)*B
     *
     * @param A offset of the argument being squared, 32-byte aligned
     * @param lA length of the argument, multiple of 32
     *
     * @param R offset where to place the result to, 32-byte aligned
     */
    function sqr ( A, lA, R ) {
        A  =  A|0;
        lA = lA|0;
        R  =  R|0;

        var al0 = 0, al1 = 0, al2 = 0, al3 = 0, al4 = 0, al5 = 0, al6 = 0, al7 = 0, ah0 = 0, ah1 = 0, ah2 = 0, ah3 = 0, ah4 = 0, ah5 = 0, ah6 = 0, ah7 = 0,
            bl0 = 0, bl1 = 0, bl2 = 0, bl3 = 0, bl4 = 0, bl5 = 0, bl6 = 0, bl7 = 0, bh0 = 0, bh1 = 0, bh2 = 0, bh3 = 0, bh4 = 0, bh5 = 0, bh6 = 0, bh7 = 0,
            r0 = 0, r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0, r6 = 0, r7 = 0, r8 = 0, r9 = 0, r10 = 0, r11 = 0, r12 = 0, r13 = 0, r14 = 0, r15 = 0,
            u = 0, v = 0, w = 0, c = 0, h = 0, m = 0, r = 0,
            d = 0, dd = 0, p = 0, i = 0, j = 0, k = 0, Ai = 0, Aj = 0, Rk = 0;

        // prepare for iterations
        for ( ; (i|0) < (lA|0); i = (i+4)|0 ) {
            Rk = R+(i<<1)|0;
            ah0 = HEAP32[(A+i)>>2]|0, al0 = ah0 & 0xffff, ah0 = ah0 >>> 16;
            u = imul(al0,al0)|0;
            v = (imul(al0,ah0)|0) + (u >>> 17)|0;
            w = (imul(ah0,ah0)|0) + (v >>> 15)|0;
            HEAP32[(Rk)>>2] = (v << 17) | (u & 0x1ffff);
            HEAP32[(Rk|4)>>2] = w;
        }

        // unrolled 1st iteration
        for ( p = 0; (p|0) < (lA|0); p = (p+8)|0 ) {
            Ai = A+p|0, Rk = R+(p<<1)|0;

            ah0 = HEAP32[(Ai)>>2]|0, al0 = ah0 & 0xffff, ah0 = ah0 >>> 16;

            bh0 = HEAP32[(Ai|4)>>2]|0, bl0 = bh0 & 0xffff, bh0 = bh0 >>> 16;

            u = imul(al0,bl0)|0;
            v = (imul(al0,bh0)|0) + (u >>> 16)|0;
            w = (imul(ah0,bl0)|0) + (v & 0xffff)|0;
            m = ((imul(ah0,bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;

            r = HEAP32[(Rk|4)>>2]|0;
            u = (r & 0xffff) + ((u & 0xffff) << 1)|0;
            w = ((r >>> 16) + ((w & 0xffff) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|4)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|8)>>2]|0;
            u = ((r & 0xffff) + ((m & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((m >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|8)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            if ( c ) {
                r = HEAP32[(Rk|12)>>2]|0;
                u = (r & 0xffff) + c|0;
                w = (r >>> 16) + (u >>> 16)|0;
                HEAP32[(Rk|12)>>2] = (w << 16) | (u & 0xffff);
            }
        }

        // unrolled 2nd iteration
        for ( p = 0; (p|0) < (lA|0); p = (p+16)|0 ) {
            Ai = A+p|0, Rk = R+(p<<1)|0;

            ah0 = HEAP32[(Ai)>>2]|0, al0 = ah0 & 0xffff, ah0 = ah0 >>> 16,
            ah1 = HEAP32[(Ai|4)>>2]|0, al1 = ah1 & 0xffff, ah1 = ah1 >>> 16;

            bh0 = HEAP32[(Ai|8)>>2]|0, bl0 = bh0 & 0xffff, bh0 = bh0 >>> 16,
            bh1 = HEAP32[(Ai|12)>>2]|0, bl1 = bh1 & 0xffff, bh1 = bh1 >>> 16;

            u = imul(al0, bl0)|0;
            v = imul(ah0, bl0)|0;
            w = ((imul(al0, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah0, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r0 = (w << 16) | (u & 0xffff);

            u = (imul(al0, bl1)|0) + (m & 0xffff)|0;
            v = (imul(ah0, bl1)|0) + (m >>> 16)|0;
            w = ((imul(al0, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah0, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r1 = (w << 16) | (u & 0xffff);

            r2 = m;

            u = (imul(al1, bl0)|0) + (r1 & 0xffff)|0;
            v = (imul(ah1, bl0)|0) + (r1 >>> 16)|0;
            w = ((imul(al1, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah1, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r1 = (w << 16) | (u & 0xffff);

            u = ((imul(al1, bl1)|0) + (r2 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah1, bl1)|0) + (r2 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al1, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah1, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r2 = (w << 16) | (u & 0xffff);

            r3 = m;

            r = HEAP32[(Rk|8)>>2]|0;
            u = (r & 0xffff) + ((r0 & 0xffff) << 1)|0;
            w = ((r >>> 16) + ((r0 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|8)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|12)>>2]|0;
            u = ((r & 0xffff) + ((r1 & 0xffff) << 1)|0)  + c|0;
            w = ((r >>> 16) + ((r1 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|12)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|16)>>2]|0;
            u = ((r & 0xffff) + ((r2 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r2 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|16)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|20)>>2]|0;
            u = ((r & 0xffff) + ((r3 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r3 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|20)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            for ( k = 24; !!c & ( (k|0) < 32 ); k = (k+4)|0 ) {
                r = HEAP32[(Rk|k)>>2]|0;
                u = (r & 0xffff) + c|0;
                w = (r >>> 16) + (u >>> 16)|0;
                HEAP32[(Rk|k)>>2] = (w << 16) | (u & 0xffff);
                c = w >>> 16;
            }
        }

        // unrolled 3rd iteration
        for ( p = 0; (p|0) < (lA|0); p = (p+32)|0 ) {
            Ai = A+p|0, Rk = R+(p<<1)|0;

            ah0 = HEAP32[(Ai)>>2]|0, al0 = ah0 & 0xffff, ah0 = ah0 >>> 16,
            ah1 = HEAP32[(Ai|4)>>2]|0, al1 = ah1 & 0xffff, ah1 = ah1 >>> 16,
            ah2 = HEAP32[(Ai|8)>>2]|0, al2 = ah2 & 0xffff, ah2 = ah2 >>> 16,
            ah3 = HEAP32[(Ai|12)>>2]|0, al3 = ah3 & 0xffff, ah3 = ah3 >>> 16;

            bh0 = HEAP32[(Ai|16)>>2]|0, bl0 = bh0 & 0xffff, bh0 = bh0 >>> 16,
            bh1 = HEAP32[(Ai|20)>>2]|0, bl1 = bh1 & 0xffff, bh1 = bh1 >>> 16,
            bh2 = HEAP32[(Ai|24)>>2]|0, bl2 = bh2 & 0xffff, bh2 = bh2 >>> 16,
            bh3 = HEAP32[(Ai|28)>>2]|0, bl3 = bh3 & 0xffff, bh3 = bh3 >>> 16;

            u = imul(al0, bl0)|0;
            v = imul(ah0, bl0)|0;
            w = ((imul(al0, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah0, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r0 = (w << 16) | (u & 0xffff);

            u = (imul(al0, bl1)|0) + (m & 0xffff)|0;
            v = (imul(ah0, bl1)|0) + (m >>> 16)|0;
            w = ((imul(al0, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah0, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r1 = (w << 16) | (u & 0xffff);

            u = (imul(al0, bl2)|0) + (m & 0xffff)|0;
            v = (imul(ah0, bl2)|0) + (m >>> 16)|0;
            w = ((imul(al0, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah0, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r2 = (w << 16) | (u & 0xffff);

            u = (imul(al0, bl3)|0) + (m & 0xffff)|0;
            v = (imul(ah0, bl3)|0) + (m >>> 16)|0;
            w = ((imul(al0, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah0, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r3 = (w << 16) | (u & 0xffff);

            r4 = m;

            u = (imul(al1, bl0)|0) + (r1 & 0xffff)|0;
            v = (imul(ah1, bl0)|0) + (r1 >>> 16)|0;
            w = ((imul(al1, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah1, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r1 = (w << 16) | (u & 0xffff);

            u = ((imul(al1, bl1)|0) + (r2 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah1, bl1)|0) + (r2 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al1, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah1, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r2 = (w << 16) | (u & 0xffff);

            u = ((imul(al1, bl2)|0) + (r3 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah1, bl2)|0) + (r3 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al1, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah1, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r3 = (w << 16) | (u & 0xffff);

            u = ((imul(al1, bl3)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah1, bl3)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al1, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah1, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r4 = (w << 16) | (u & 0xffff);

            r5 = m;

            u = (imul(al2, bl0)|0) + (r2 & 0xffff)|0;
            v = (imul(ah2, bl0)|0) + (r2 >>> 16)|0;
            w = ((imul(al2, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah2, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r2 = (w << 16) | (u & 0xffff);

            u = ((imul(al2, bl1)|0) + (r3 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah2, bl1)|0) + (r3 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al2, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah2, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r3 = (w << 16) | (u & 0xffff);

            u = ((imul(al2, bl2)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah2, bl2)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al2, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah2, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r4 = (w << 16) | (u & 0xffff);

            u = ((imul(al2, bl3)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah2, bl3)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al2, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah2, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r5 = (w << 16) | (u & 0xffff);

            r6 = m;

            u = (imul(al3, bl0)|0) + (r3 & 0xffff)|0;
            v = (imul(ah3, bl0)|0) + (r3 >>> 16)|0;
            w = ((imul(al3, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah3, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r3 = (w << 16) | (u & 0xffff);

            u = ((imul(al3, bl1)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah3, bl1)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al3, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah3, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r4 = (w << 16) | (u & 0xffff);

            u = ((imul(al3, bl2)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah3, bl2)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al3, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah3, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r5 = (w << 16) | (u & 0xffff);

            u = ((imul(al3, bl3)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
            v = ((imul(ah3, bl3)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
            w = ((imul(al3, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
            m = ((imul(ah3, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
            r6 = (w << 16) | (u & 0xffff);

            r7 = m;

            r = HEAP32[(Rk|16)>>2]|0;
            u = (r & 0xffff) + ((r0 & 0xffff) << 1)|0;
            w = ((r >>> 16) + ((r0 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|16)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|20)>>2]|0;
            u = ((r & 0xffff) + ((r1 & 0xffff) << 1)|0)  + c|0;
            w = ((r >>> 16) + ((r1 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|20)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|24)>>2]|0;
            u = ((r & 0xffff) + ((r2 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r2 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|24)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk|28)>>2]|0;
            u = ((r & 0xffff) + ((r3 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r3 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk|28)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk+32)>>2]|0;
            u = ((r & 0xffff) + ((r4 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r4 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk+32)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk+36)>>2]|0;
            u = ((r & 0xffff) + ((r5 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r5 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk+36)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk+40)>>2]|0;
            u = ((r & 0xffff) + ((r6 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r6 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk+40)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            r = HEAP32[(Rk+44)>>2]|0;
            u = ((r & 0xffff) + ((r7 & 0xffff) << 1)|0) + c|0;
            w = ((r >>> 16) + ((r7 >>> 16) << 1)|0) + (u >>> 16)|0;
            HEAP32[(Rk+44)>>2] = (w << 16) | (u & 0xffff);
            c = w >>> 16;

            for ( k = 48; !!c & ( (k|0) < 64 ); k = (k+4)|0 ) {
                r = HEAP32[(Rk+k)>>2]|0;
                u = (r & 0xffff) + c|0;
                w = (r >>> 16) + (u >>> 16)|0;
                HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                c = w >>> 16;
            }
        }

        // perform iterations
        for ( d = 32; (d|0) < (lA|0); d = d << 1 ) { // depth loop
            dd = d << 1;

            for ( p = 0; (p|0) < (lA|0); p = (p+dd)|0 ) { // part loop
                Rk = R+(p<<1)|0;

                h = 0;
                for ( i = 0; (i|0) < (d|0); i = (i+32)|0 ) { // multiply-and-add loop
                    Ai = (A+p|0)+i|0;

                    ah0 = HEAP32[(Ai)>>2]|0, al0 = ah0 & 0xffff, ah0 = ah0 >>> 16,
                    ah1 = HEAP32[(Ai|4)>>2]|0, al1 = ah1 & 0xffff, ah1 = ah1 >>> 16,
                    ah2 = HEAP32[(Ai|8)>>2]|0, al2 = ah2 & 0xffff, ah2 = ah2 >>> 16,
                    ah3 = HEAP32[(Ai|12)>>2]|0, al3 = ah3 & 0xffff, ah3 = ah3 >>> 16,
                    ah4 = HEAP32[(Ai|16)>>2]|0, al4 = ah4 & 0xffff, ah4 = ah4 >>> 16,
                    ah5 = HEAP32[(Ai|20)>>2]|0, al5 = ah5 & 0xffff, ah5 = ah5 >>> 16,
                    ah6 = HEAP32[(Ai|24)>>2]|0, al6 = ah6 & 0xffff, ah6 = ah6 >>> 16,
                    ah7 = HEAP32[(Ai|28)>>2]|0, al7 = ah7 & 0xffff, ah7 = ah7 >>> 16;

                    r8 = r9 = r10 = r11 = r12 = r13 = r14 = r15 = c = 0;

                    for ( j = 0; (j|0) < (d|0); j = (j+32)|0 ) {
                        Aj = ((A+p|0)+d|0)+j|0;

                        bh0 = HEAP32[(Aj)>>2]|0, bl0 = bh0 & 0xffff, bh0 = bh0 >>> 16,
                        bh1 = HEAP32[(Aj|4)>>2]|0, bl1 = bh1 & 0xffff, bh1 = bh1 >>> 16,
                        bh2 = HEAP32[(Aj|8)>>2]|0, bl2 = bh2 & 0xffff, bh2 = bh2 >>> 16,
                        bh3 = HEAP32[(Aj|12)>>2]|0, bl3 = bh3 & 0xffff, bh3 = bh3 >>> 16,
                        bh4 = HEAP32[(Aj|16)>>2]|0, bl4 = bh4 & 0xffff, bh4 = bh4 >>> 16,
                        bh5 = HEAP32[(Aj|20)>>2]|0, bl5 = bh5 & 0xffff, bh5 = bh5 >>> 16,
                        bh6 = HEAP32[(Aj|24)>>2]|0, bl6 = bh6 & 0xffff, bh6 = bh6 >>> 16,
                        bh7 = HEAP32[(Aj|28)>>2]|0, bl7 = bh7 & 0xffff, bh7 = bh7 >>> 16;

                        r0 = r1 = r2 = r3 = r4 = r5 = r6 = r7 = 0;

                        u = ((imul(al0, bl0)|0) + (r0 & 0xffff)|0) + (r8 & 0xffff)|0;
                        v = ((imul(ah0, bl0)|0) + (r0 >>> 16)|0) + (r8 >>> 16)|0;
                        w = ((imul(al0, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r0 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl1)|0) + (r1 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl1)|0) + (r1 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r1 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl2)|0) + (r2 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl2)|0) + (r2 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r2 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl3)|0) + (r3 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl3)|0) + (r3 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r3 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl4)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl4)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r4 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl5)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl5)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r5 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl6)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl6)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al0, bl7)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah0, bl7)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al0, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah0, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        r8 = m;

                        u = ((imul(al1, bl0)|0) + (r1 & 0xffff)|0) + (r9 & 0xffff)|0;
                        v = ((imul(ah1, bl0)|0) + (r1 >>> 16)|0) + (r9 >>> 16)|0;
                        w = ((imul(al1, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r1 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl1)|0) + (r2 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl1)|0) + (r2 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r2 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl2)|0) + (r3 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl2)|0) + (r3 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r3 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl3)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl3)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r4 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl4)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl4)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r5 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl5)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl5)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl6)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl6)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al1, bl7)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah1, bl7)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al1, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah1, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        r9 = m;

                        u = ((imul(al2, bl0)|0) + (r2 & 0xffff)|0) + (r10 & 0xffff)|0;
                        v = ((imul(ah2, bl0)|0) + (r2 >>> 16)|0) + (r10 >>> 16)|0;
                        w = ((imul(al2, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r2 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl1)|0) + (r3 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl1)|0) + (r3 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r3 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl2)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl2)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r4 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl3)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl3)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r5 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl4)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl4)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl5)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl5)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl6)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl6)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        u = ((imul(al2, bl7)|0) + (r9 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah2, bl7)|0) + (r9 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al2, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah2, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r9 = (w << 16) | (u & 0xffff);

                        r10 = m;

                        u = ((imul(al3, bl0)|0) + (r3 & 0xffff)|0) + (r11 & 0xffff)|0;
                        v = ((imul(ah3, bl0)|0) + (r3 >>> 16)|0) + (r11 >>> 16)|0;
                        w = ((imul(al3, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r3 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl1)|0) + (r4 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl1)|0) + (r4 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r4 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl2)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl2)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r5 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl3)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl3)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl4)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl4)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl5)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl5)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl6)|0) + (r9 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl6)|0) + (r9 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r9 = (w << 16) | (u & 0xffff);

                        u = ((imul(al3, bl7)|0) + (r10 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah3, bl7)|0) + (r10 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al3, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah3, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r10 = (w << 16) | (u & 0xffff);

                        r11 = m;

                        u = ((imul(al4, bl0)|0) + (r4 & 0xffff)|0) + (r12 & 0xffff)|0;
                        v = ((imul(ah4, bl0)|0) + (r4 >>> 16)|0) + (r12 >>> 16)|0;
                        w = ((imul(al4, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r4 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl1)|0) + (r5 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl1)|0) + (r5 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r5 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl2)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl2)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl3)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl3)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl4)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl4)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl5)|0) + (r9 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl5)|0) + (r9 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r9 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl6)|0) + (r10 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl6)|0) + (r10 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r10 = (w << 16) | (u & 0xffff);

                        u = ((imul(al4, bl7)|0) + (r11 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah4, bl7)|0) + (r11 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al4, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah4, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r11 = (w << 16) | (u & 0xffff);

                        r12 = m;

                        u = ((imul(al5, bl0)|0) + (r5 & 0xffff)|0) + (r13 & 0xffff)|0;
                        v = ((imul(ah5, bl0)|0) + (r5 >>> 16)|0) + (r13 >>> 16)|0;
                        w = ((imul(al5, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r5 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl1)|0) + (r6 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl1)|0) + (r6 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl2)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl2)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl3)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl3)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl4)|0) + (r9 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl4)|0) + (r9 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r9 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl5)|0) + (r10 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl5)|0) + (r10 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r10 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl6)|0) + (r11 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl6)|0) + (r11 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r11 = (w << 16) | (u & 0xffff);

                        u = ((imul(al5, bl7)|0) + (r12 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah5, bl7)|0) + (r12 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al5, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah5, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r12 = (w << 16) | (u & 0xffff);

                        r13 = m;

                        u = ((imul(al6, bl0)|0) + (r6 & 0xffff)|0) + (r14 & 0xffff)|0;
                        v = ((imul(ah6, bl0)|0) + (r6 >>> 16)|0) + (r14 >>> 16)|0;
                        w = ((imul(al6, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r6 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl1)|0) + (r7 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl1)|0) + (r7 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl2)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl2)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl3)|0) + (r9 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl3)|0) + (r9 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r9 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl4)|0) + (r10 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl4)|0) + (r10 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r10 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl5)|0) + (r11 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl5)|0) + (r11 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r11 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl6)|0) + (r12 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl6)|0) + (r12 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r12 = (w << 16) | (u & 0xffff);

                        u = ((imul(al6, bl7)|0) + (r13 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah6, bl7)|0) + (r13 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al6, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah6, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r13 = (w << 16) | (u & 0xffff);

                        r14 = m;

                        u = ((imul(al7, bl0)|0) + (r7 & 0xffff)|0) + (r15 & 0xffff)|0;
                        v = ((imul(ah7, bl0)|0) + (r7 >>> 16)|0) + (r15 >>> 16)|0;
                        w = ((imul(al7, bh0)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh0)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r7 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl1)|0) + (r8 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl1)|0) + (r8 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh1)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh1)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r8 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl2)|0) + (r9 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl2)|0) + (r9 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh2)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh2)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r9 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl3)|0) + (r10 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl3)|0) + (r10 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh3)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh3)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r10 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl4)|0) + (r11 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl4)|0) + (r11 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh4)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh4)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r11 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl5)|0) + (r12 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl5)|0) + (r12 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh5)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh5)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r12 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl6)|0) + (r13 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl6)|0) + (r13 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh6)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh6)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r13 = (w << 16) | (u & 0xffff);

                        u = ((imul(al7, bl7)|0) + (r14 & 0xffff)|0) + (m & 0xffff)|0;
                        v = ((imul(ah7, bl7)|0) + (r14 >>> 16)|0) + (m >>> 16)|0;
                        w = ((imul(al7, bh7)|0) + (v & 0xffff)|0) + (u >>> 16)|0;
                        m = ((imul(ah7, bh7)|0) + (v >>> 16)|0) + (w >>> 16)|0;
                        r14 = (w << 16) | (u & 0xffff);

                        r15 = m;

                        k = d+(i+j|0)|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r0 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r0 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r1 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r1 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r2 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r2 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r3 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r3 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r4 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r4 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r5 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r5 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r6 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r6 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;

                        k = k+4|0;
                        r = HEAP32[(Rk+k)>>2]|0;
                        u = ((r & 0xffff) + ((r7 & 0xffff) << 1)|0) + c|0;
                        w = ((r >>> 16) + ((r7 >>> 16) << 1)|0) + (u >>> 16)|0;
                        HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                        c = w >>> 16;
                    }

                    k = d+(i+j|0)|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = (((r & 0xffff) + ((r8 & 0xffff) << 1)|0) + c|0) + h|0;
                    w = ((r >>> 16) + ((r8 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r9 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r9 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r10 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r10 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r11 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r11 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r12 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r12 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r13 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r13 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r14 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r14 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    c = w >>> 16;

                    k = k+4|0;
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = ((r & 0xffff) + ((r15 & 0xffff) << 1)|0) + c|0;
                    w = ((r >>> 16) + ((r15 >>> 16) << 1)|0) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    h = w >>> 16;
                }

                for ( k = k+4|0; !!h & ( (k|0) < (dd<<1) ); k = (k+4)|0 ) { // carry propagation loop
                    r = HEAP32[(Rk+k)>>2]|0;
                    u = (r & 0xffff) + h|0;
                    w = (r >>> 16) + (u >>> 16)|0;
                    HEAP32[(Rk+k)>>2] = (w << 16) | (u & 0xffff);
                    h = w >>> 16;
                }
            }
        }
    }

    /**
     * Conventional division
     *
     * @param A offset of the numerator, 32-byte aligned
     * @param lA length of the numerator, multiple of 32
     *
     * @param B offset of the divisor, 32-byte aligned
     * @param lB length of the divisor, multiple of 32
     *
     * @param R offset where to place the remainder to, 32-byte aligned
     *
     * @param Q offser where to place the quotient to, 32-byte aligned
     */

    function div ( N, lN, D, lD, R, Q ) {
        N  =  N|0;
        lN = lN|0
        D  =  D|0;
        lD = lD|0
        R  =  R|0;
        Q  =  Q|0;

        var n = 0, d = 0, e = 0,
            u1 = 0, u0 = 0,
            v0 = 0, vh = 0, vl = 0,
            qh = 0, ql = 0, rh = 0, rl = 0,
            t1 = 0, t2 = 0, m = 0, c = 0,
            i = 0, j = 0, k = 0;

        // copy `N` to `R`
        cp( lN, N, R );

        // number of significant limbs in `N` (multiplied by 4)
        for ( i = (lN-1) & -4; (i|0) >= 0; i = (i-4)|0 ) {
            n = HEAP32[(N+i)>>2]|0;
            if ( n ) {
                lN = i;
                break;
            }
        }

        // number of significant limbs in `D` (multiplied by 4)
        for ( i = (lD-1) & -4; (i|0) >= 0; i = (i-4)|0 ) {
            d = HEAP32[(D+i)>>2]|0;
            if ( d ) {
                lD = i;
                break;
            }
        }

        // `D` is zero? WTF?!

        // calculate `e` — the power of 2 of the normalization factor
        while ( (d & 0x80000000) == 0 ) {
            d = d << 1;
            e = e + 1|0;
        }

        // shift `R` for `e` bits left
        u0 = HEAP32[(N+lN)>>2]|0;
        if ( e ) u1 = u0>>>(32-e|0);
        for ( i = (lN-4)|0; (i|0) >= 0; i = (i-4)|0 ) {
            n = HEAP32[(N+i)>>2]|0;
            HEAP32[(R+i+4)>>2] = (u0 << e) | ( e ? n >>> (32-e|0) : 0 );
            u0 = n;
        }
        HEAP32[R>>2] = u0 << e;

        // normalize `D` in place
        if ( e ) {
            v0 = HEAP32[(D+lD)>>2]|0;
            for ( i = (lD-4)|0; (i|0) >= 0; i = (i-4)|0 ) {
                d = HEAP32[(D+i)>>2]|0;
                HEAP32[(D+i+4)>>2] = (v0 << e) | ( d >>> (32-e|0) );
                v0 = d;
            }
            HEAP32[D>>2] = v0 << e;
        }

        // divisor parts won't change
        v0 = HEAP32[(D+lD)>>2]|0;
        vh = v0 >>> 16, vl = v0 & 0xffff;

        // perform division
        for ( i = lN; (i|0) >= (lD|0); i = (i-4)|0 ) {
            j = (i-lD)|0;

            // estimate high part of the quotient
            u0 = HEAP32[(R+i)>>2]|0;
            qh = ( (u1>>>0) / (vh>>>0) )|0, rh = ( (u1>>>0) % (vh>>>0) )|0, t1 = imul(qh, vl)|0;
            while ( ( (qh|0) == 0x10000 ) | ( (t1>>>0) > (((rh << 16)|(u0 >>> 16))>>>0) ) ) {
                qh = (qh-1)|0, rh = (rh+vh)|0, t1 = (t1-vl)|0;
                if ( (rh|0) >= 0x10000 ) break;
            }

            // bulk multiply-and-subtract
            // m - multiplication carry, c - subtraction carry
            m = 0, c = 0;
            for ( k = 0; (k|0) <= (lD|0); k = (k+4)|0 ) {
                d = HEAP32[(D+k)>>2]|0;
                t1 = (imul(qh, d & 0xffff)|0) + (m >>> 16)|0;
                t2 = (imul(qh, d >>> 16)|0) + (t1 >>> 16)|0;
                d = (m & 0xffff) | (t1 << 16);
                m = t2;
                n = HEAP32[(R+j+k)>>2]|0;
                t1 = ((n & 0xffff) - (d & 0xffff)|0) + c|0;
                t2 = ((n >>> 16) - (d >>> 16)|0) + (t1 >> 16)|0;
                HEAP32[(R+j+k)>>2] = (t2 << 16) | (t1 & 0xffff);
                c = t2 >> 16;
            }
            t1 = ((u1 & 0xffff) - (m & 0xffff)|0) + c|0;
            t2 = ((u1 >>> 16) - (m >>> 16)|0) + (t1 >> 16)|0;
            HEAP32[(R+j+k)>>2] = u1 = (t2 << 16) | (t1 & 0xffff);
            c = t2 >> 16;

            // add `D` back if got carry-out
            if ( c ) {
                qh = (qh-1)|0, rh = (rh-vh)|0;
                c = 0;
                for ( k = 0; (k|0) <= (lD|0); k = (k+4)|0 ) {
                    d = HEAP32[(D+k)>>2]|0;
                    n = HEAP32[(R+j+k)>>2]|0;
                    t1 = ((n & 0xffff) + (d & 0xffff)|0) + c|0;
                    t2 = ((n >>> 16) + (d >>> 16)|0) + (t1 >>> 16)|0;
                    HEAP32[(R+j+k)>>2] = (t2 << 16) | (t1 & 0xffff);
                    c = t2 >>> 16;
                }
                HEAP32[(R+j+k)>>2] = u1 = (u1+c)|0;
            }

            // estimate low part of the quotient
            u0 = HEAP32[(R+i)>>2]|0;
            n = (u1 << 16) | (u0 >>> 16);
            ql = ( (n>>>0) / (vh>>>0) )|0, rl = ( (n>>>0) % (vh>>>0) )|0, t1 = imul(ql, vl)|0;
            while ( ( (ql|0) == 0x10000 ) | ( (t1>>>0) > (((rl << 16)|(u0 & 0xffff))>>>0) ) ) {
                ql = (ql-1)|0, rl = (rl+vh)|0, t1 = (t1-vl)|0;
                if ( (rl|0) >= 0x10000 ) break;
            }

            // bulk multiply-and-subtract
            // m - multiplication carry, c - subtraction carry
            m = 0, c = 0;
            for ( k = 0; (k|0) <= (lD|0); k = (k+4)|0 ) {
                d = HEAP32[(D+k)>>2]|0;
                t1 = (imul(ql, d & 0xffff)|0) + (m & 0xffff)|0;
                t2 = ((imul(ql, d >>> 16)|0) + (t1 >>> 16)|0) + (m >>> 16)|0;
                d = (t1 & 0xffff) | (t2 << 16);
                m = t2 >>> 16;
                n = HEAP32[(R+j+k)>>2]|0;
                t1 = ((n & 0xffff) - (d & 0xffff)|0) + c|0;
                t2 = ((n >>> 16) - (d >>> 16)|0) + (t1 >> 16)|0;
                c = t2 >> 16;
                HEAP32[(R+j+k)>>2] = (t2 << 16) | (t1 & 0xffff);
            }
            t1 = ((u1 & 0xffff) - (m & 0xffff)|0) + c|0;
            t2 = ((u1 >>> 16) - (m >>> 16)|0) + (t1 >> 16)|0;
            HEAP32[(R+j+k)>>2] = u1 = (t2 << 16) | (t1 & 0xffff);
            c = t2 >> 16;

            // add `D` back if got carry-out
            if ( c ) {
                ql = (ql-1)|0, rl = (rl+vh)|0;
                c = 0;
                for ( k = 0; (k|0) <= (lD|0); k = (k+4)|0 ) {
                    d = HEAP32[(D+k)>>2]|0;
                    n = HEAP32[(R+j+k)>>2]|0;
                    t1 = ((n & 0xffff) + (d & 0xffff)|0) + c|0;
                    t2 = ((n >>> 16) + (d >>> 16)|0) + (t1 >>> 16)|0;
                    c = t2 >>> 16;
                    HEAP32[(R+j+k)>>2] = (t1 & 0xffff) | (t2 << 16);
                }
                HEAP32[(R+j+k)>>2] = (u1+c)|0;
            }

            // got quotient limb
            HEAP32[(Q+j)>>2] = (qh << 16) | ql;

            u1 = HEAP32[(R+i)>>2]|0;
        }

        if ( e ) {
            // TODO denormalize `D` in place

            // denormalize `R` in place
            u0 = HEAP32[R>>2]|0;
            for ( i = 4; (i|0) <= (lD|0); i = (i+4)|0 ) {
                n = HEAP32[(R+i)>>2]|0;
                HEAP32[(R+i-4)>>2] = ( n << (32-e|0) ) | (u0 >>> e);
                u0 = n;
            }
            HEAP32[(R+lD)>>2] = u0 >>> e;
        }
    }

    /**
     * Montgomery modular reduction
     *
     * Definition:
     *
     *  MREDC(A) = A × X (mod N),
     *  M × X = N × Y + 1,
     *
     * where M = 2^(32*m) such that N < M and A < N×M
     *
     * Numbers `X` and `Y` can be calculated using Extended Euclidean Algorithm.
     */
    function mredc ( A, lA, N, lN, y, R ) {
        A  =  A|0;
        lA = lA|0;
        N  =  N|0;
        lN = lN|0;
        y  =  y|0;
        R  =  R|0;

        var T = 0,
            c = 0, uh = 0, ul = 0, vl = 0, vh = 0, w0 = 0, w1 = 0, w2 = 0, r0 = 0, r1 = 0,
            i = 0, j = 0, k = 0;

        T = salloc(lN<<1)|0;
        z(lN<<1, 0, T);

        cp( lA, A, T );

        // HAC 14.32
        for ( i = 0; (i|0) < (lN|0); i = (i+4)|0 ) {
            uh = HEAP32[(T+i)>>2]|0, ul = uh & 0xffff, uh = uh >>> 16;
            vh = y >>> 16, vl = y & 0xffff;
            w0 = imul(ul,vl)|0, w1 = ( (imul(ul,vh)|0) + (imul(uh,vl)|0) | 0 ) + (w0 >>> 16) | 0;
            ul = w0 & 0xffff, uh = w1 & 0xffff;
            r1 = 0;
            for ( j = 0; (j|0) < (lN|0); j = (j+4)|0 ) {
                k = (i+j)|0;
                vh = HEAP32[(N+j)>>2]|0, vl = vh & 0xffff, vh = vh >>> 16;
                r0 = HEAP32[(T+k)>>2]|0;
                w0 = ((imul(ul, vl)|0) + (r1 & 0xffff)|0) + (r0 & 0xffff)|0;
                w1 = ((imul(ul, vh)|0) + (r1 >>> 16)|0) + (r0 >>> 16)|0;
                w2 = ((imul(uh, vl)|0) + (w1 & 0xffff)|0) + (w0 >>> 16)|0;
                r1 = ((imul(uh, vh)|0) + (w2 >>> 16)|0) + (w1 >>> 16)|0;
                r0 = (w2 << 16) | (w0 & 0xffff);
                HEAP32[(T+k)>>2] = r0;
            }
            k = (i+j)|0;
            r0 = HEAP32[(T+k)>>2]|0;
            w0 = ((r0 & 0xffff) + (r1 & 0xffff)|0) + c|0;
            w1 = ((r0 >>> 16) + (r1 >>> 16)|0) + (w0 >>> 16)|0;
            HEAP32[(T+k)>>2] = (w1 << 16) | (w0 & 0xffff);
            c = w1 >>> 16;
        }

        cp( lN, (T+lN)|0, R );

        sfree(lN<<1);

        if ( c | ( (cmp( N, lN, R, lN )|0) <= 0 ) ) {
            sub( R, lN, N, lN, R, lN )|0;
        }
    }

    return {
        sreset: sreset,
        salloc: salloc,
        sfree:  sfree,
        z: z,
        tst: tst,
        neg: neg,
        cmp: cmp,
        add: add,
        sub: sub,
        mul: mul,
        sqr: sqr,
        div: div,
        mredc: mredc
    };
}

function is_big_number ( a ) {
    return ( a instanceof BigNumber );
}

///////////////////////////////////////////////////////////////////////////////

var _bigint_heap = new Uint32Array(0x100000),
    _bigint_asm = bigint_asm( global, null, _bigint_heap.buffer );

///////////////////////////////////////////////////////////////////////////////

var _BigNumber_ZERO_limbs = new Uint32Array(0);

function BigNumber ( num ) {
    var limbs = _BigNumber_ZERO_limbs,
        bitlen = 0,
        sign = 0;

    if ( is_string(num) )
        num = string_to_bytes(num);

    if ( is_buffer(num) )
        num = new Uint8Array(num);

    if ( num === undefined ) {
        // do nothing
    }
    else if ( is_number(num) ) {
        var absnum = Math.abs(num);
        if ( absnum > 0xffffffff ) {
            limbs = new Uint32Array(2);
            limbs[0] = absnum|0;
            limbs[1] = (absnum/0x100000000)|0;
            bitlen = 52;
        }
        else if ( absnum > 0 ) {
            limbs = new Uint32Array(1);
            limbs[0] = absnum;
            bitlen = 32;
        }
        else {
            limbs = _BigNumber_ZERO_limbs;
            bitlen = 0;
        }
        sign = num < 0 ? -1 : 1;
    }
    else if ( is_bytes(num) ) {
        bitlen = num.length * 8;
        if ( !bitlen )
            return BigNumber_ZERO;

        limbs = new Uint32Array( (bitlen + 31) >> 5 );
        for ( var i = num.length-4; i >= 0 ; i -= 4 ) {
            limbs[(num.length-4-i)>>2] = (num[i] << 24) | (num[i+1] << 16) | (num[i+2] << 8) | num[i+3];
        }
        if ( i === -3 ) {
            limbs[limbs.length-1] = num[0];
        }
        else if ( i === -2 ) {
            limbs[limbs.length-1] = (num[0] << 8) | num[1];
        }
        else if ( i === -1 ) {
            limbs[limbs.length-1] = (num[0] << 16) | (num[1] << 8) | num[2];
        }

        sign = 1;
    }
    else if ( typeof num === 'object' && num !== null ) {
        limbs = new Uint32Array( num.limbs );
        bitlen = num.bitLength;
        sign = num.sign;
    }
    else {
        throw new TypeError("number is of unexpected type");
    }

    this.limbs = limbs;
    this.bitLength = bitlen;
    this.sign = sign;
}

function BigNumber_toString ( radix ) {
    radix = radix || 16;

    var limbs = this.limbs,
        bitlen = this.bitLength,
        str = '';

    if ( radix === 16 ) {
        // FIXME clamp last limb to (bitlen % 32)
        for ( var i = (bitlen+31>>5)-1; i >= 0; i-- ) {
            var h = limbs[i].toString(16);
            str += '00000000'.substr(h.length);
            str += h;
        }

        str = str.replace( /^0+/, '' );

        if ( !str.length )
            str = '0';
    }
    else {
        throw new IllegalArgumentError("bad radix");
    }

    if ( this.sign < 0 )
        str = '-' + str;

    return str;
}

function BigNumber_toBytes () {
    var bitlen = this.bitLength,
        limbs = this.limbs;

    if ( bitlen === 0 )
        return new Uint8Array(0);

    var bytelen = ( bitlen + 7 ) >> 3,
        bytes = new Uint8Array(bytelen);
    for ( var i = 0; i < bytelen; i++ ) {
        var j = bytelen - i - 1;
        bytes[i] = limbs[j>>2] >> ( (j & 3) << 3 );
    }

    return bytes;
}

// Downgrade to Number
function BigNumber_valueOf () {
    var limbs = this.limbs,
        bits = this.bitLength,
        sign = this.sign;

    if ( !sign )
        return 0;

    if ( bits <= 32 )
        return sign * (limbs[0]>>>0);

    if ( bits <= 52 )
        return sign * ( 0x100000000 * (limbs[1]>>>0) + (limbs[0]>>>0) );

    // normalization
    var i, l, e = 0;
    for ( i = limbs.length-1; i >= 0; i-- ) {
        if ( (l = limbs[i]) === 0 ) continue;
        while ( ( (l << e) & 0x80000000 ) === 0 ) e++;
        break;
    }

    if ( i === 0 )
        return sign * (limbs[0]>>>0);

    return sign * ( 0x100000 * (( (limbs[i] << e) | ( e ? limbs[i-1] >>> (32-e) : 0 ) )>>>0)
                             + (( (limbs[i-1] << e) | ( e && i > 1 ? limbs[i-2] >>> (32-e) : 0 ) )>>>12)
                  ) * Math.pow( 2, 32*i-e-52 );
}

function BigNumber_clamp ( b ) {
    var limbs = this.limbs,
        bitlen = this.bitLength;

    // FIXME check b is number and in a valid range

    if ( b >= bitlen )
        return this;

    var clamped = new BigNumber,
        n = (b + 31) >> 5,
        k = b % 32;

    clamped.limbs = new Uint32Array( limbs.subarray(0,n) );
    clamped.bitLength = b;
    clamped.sign = this.sign;

    if ( k ) clamped.limbs[n-1] &= (-1 >>> (32-k));

    return clamped;
}

function BigNumber_slice ( f, b ) {
    if ( !is_number(f) )
        throw new TypeError("TODO");

    if ( b !== undefined && !is_number(b) )
        throw new TypeError("TODO");

    var limbs = this.limbs,
        bitlen = this.bitLength;

    if ( f < 0 )
        throw new RangeError("TODO");

    if ( f >= bitlen )
        return BigNumber_ZERO;

    if ( b === undefined || b > bitlen - f )
        b = bitlen - f;

    var sliced = new BigNumber, slimbs,
        n = f >> 5, m = (f + b + 31) >> 5, l = (b + 31) >> 5,
        t = f % 32, k = b % 32;

    slimbs = new Uint32Array(l);
    if ( t ) {
        for ( var i = 0; i < m-n-1; i++ ) {
            slimbs[i] = (limbs[n+i]>>>t) | ( limbs[n+i+1]<<(32-t) );
        }
        slimbs[i] = limbs[n+i]>>>t;
    }
    else {
        slimbs.set( limbs.subarray(n, m) );
    }

    if ( k ) {
        slimbs[l-1] &= (-1 >>> (32-k));
    }

    sliced.limbs = slimbs
    sliced.bitLength = b;
    sliced.sign = this.sign;

    return sliced;
}

///////////////////////////////////////////////////////////////////////////////

function BigNumber_negate () {
    var negative = new BigNumber;

    negative.limbs = this.limbs;
    negative.bitLength = this.bitLength;
    negative.sign = -1 * this.sign;

    return negative;
}

function BigNumber_compare ( that ) {
    if ( !is_big_number(that) )
        that = new BigNumber(that);

    var alimbs = this.limbs, alimbcnt = alimbs.length,
        blimbs = that.limbs, blimbcnt = blimbs.length,
        z = 0;

    if ( this.sign < that.sign )
        return -1;

    if ( this.sign > that.sign )
        return 1;

    _bigint_heap.set( alimbs, 0 );
    _bigint_heap.set( blimbs, alimbcnt );
    z = _bigint_asm.cmp( 0, alimbcnt<<2, alimbcnt<<2, blimbcnt<<2 );

    return z * this.sign;
}

function BigNumber_add ( that ) {
    if ( !is_big_number(that) )
        that = new BigNumber(that);

    if ( !this.sign )
        return that;

    if ( !that.sign )
        return this;

    var abitlen = this.bitLength, alimbs = this.limbs, alimbcnt = alimbs.length, asign = this.sign,
        bbitlen = that.bitLength, blimbs = that.limbs, blimbcnt = blimbs.length, bsign = that.sign,
        rbitlen, rlimbcnt, rsign, rof, result = new BigNumber;

    rbitlen = ( abitlen > bbitlen ? abitlen : bbitlen ) + ( asign * bsign > 0 ? 1 : 0 );
    rlimbcnt = ( rbitlen + 31 ) >> 5;

    _bigint_asm.sreset();

    var pA = _bigint_asm.salloc( alimbcnt<<2 ),
        pB = _bigint_asm.salloc( blimbcnt<<2 ),
        pR = _bigint_asm.salloc( rlimbcnt<<2 );

    _bigint_asm.z( pR-pA+(rlimbcnt<<2), 0, pA );

    _bigint_heap.set( alimbs, pA>>2 );
    _bigint_heap.set( blimbs, pB>>2 );

    if ( asign * bsign > 0 ) {
        _bigint_asm.add( pA, alimbcnt<<2, pB, blimbcnt<<2, pR, rlimbcnt<<2 );
        rsign = asign;
    }
    else if ( asign > bsign ) {
        rof = _bigint_asm.sub( pA, alimbcnt<<2, pB, blimbcnt<<2, pR, rlimbcnt<<2 );
        rsign = rof ? bsign : asign;
    }
    else {
        rof = _bigint_asm.sub( pB, blimbcnt<<2, pA, alimbcnt<<2, pR, rlimbcnt<<2 );
        rsign = rof ? asign : bsign;
    }

    if ( rof )
        _bigint_asm.neg( pR, rlimbcnt<<2, pR, rlimbcnt<<2 );

    if ( _bigint_asm.tst( pR, rlimbcnt<<2 ) === 0 )
        return BigNumber_ZERO;

    result.limbs = new Uint32Array( _bigint_heap.subarray( pR>>2, (pR>>2)+rlimbcnt ) );
    result.bitLength = rbitlen;
    result.sign = rsign;

    return result;
}

function BigNumber_subtract ( that ) {
    if ( !is_big_number(that) )
        that = new BigNumber(that);

    return this.add( that.negate() );
}

function BigNumber_multiply ( that ) {
    if ( !is_big_number(that) )
        that = new BigNumber(that);

    if ( !this.sign || !that.sign )
        return BigNumber_ZERO;

    var abitlen = this.bitLength, alimbs = this.limbs, alimbcnt = alimbs.length,
        bbitlen = that.bitLength, blimbs = that.limbs, blimbcnt = blimbs.length,
        rbitlen, rlimbcnt, result = new BigNumber;

    rbitlen = abitlen + bbitlen;
    rlimbcnt = ( rbitlen + 31 ) >> 5;

    _bigint_asm.sreset();

    var pA = _bigint_asm.salloc( alimbcnt<<2 ),
        pB = _bigint_asm.salloc( blimbcnt<<2 ),
        pR = _bigint_asm.salloc( rlimbcnt<<2 );

    _bigint_asm.z( pR-pA+(rlimbcnt<<2), 0, pA );

    _bigint_heap.set( alimbs, pA>>2 );
    _bigint_heap.set( blimbs, pB>>2 );

    _bigint_asm.mul( pA, alimbcnt<<2, pB, blimbcnt<<2, pR, rlimbcnt<<2 );

    result.limbs = new Uint32Array( _bigint_heap.subarray( pR>>2, (pR>>2)+rlimbcnt ) );
    result.sign = this.sign * that.sign;
    result.bitLength = rbitlen;

    return result;
}

function BigNumber_square () {
    if ( !this.sign )
        return BigNumber_ZERO;

    var abitlen = this.bitLength, alimbs = this.limbs, alimbcnt = alimbs.length,
        rbitlen, rlimbcnt, result = new BigNumber;

    rbitlen = abitlen << 1;
    rlimbcnt = ( rbitlen + 31 ) >> 5;

    _bigint_asm.sreset();

    var pA = _bigint_asm.salloc( alimbcnt<<2 ),
        pR = _bigint_asm.salloc( rlimbcnt<<2 );

    _bigint_asm.z( pR-pA+(rlimbcnt<<2), 0, pA );

    _bigint_heap.set( alimbs, pA>>2 );

    _bigint_asm.sqr( pA, alimbcnt<<2, pR );

    result.limbs = new Uint32Array( _bigint_heap.subarray( pR>>2, (pR>>2)+rlimbcnt ) );
    result.bitLength = rbitlen;
    result.sign = 1;

    return result;
}

function BigNumber_divide ( that ) {
    if ( !is_big_number(that) )
        that = new BigNumber(that);

    var abitlen = this.bitLength, alimbs = this.limbs, alimbcnt = alimbs.length,
        bbitlen = that.bitLength, blimbs = that.limbs, blimbcnt = blimbs.length,
        qlimbcnt, rlimbcnt, quotient = BigNumber_ZERO, remainder = BigNumber_ZERO;

    _bigint_asm.sreset();

    var pA = _bigint_asm.salloc( alimbcnt<<2 ),
        pB = _bigint_asm.salloc( blimbcnt<<2 ),
        pR = _bigint_asm.salloc( blimbcnt<<2 ),
        pQ = _bigint_asm.salloc( alimbcnt<<2 );

    _bigint_asm.z( pQ-pA+(alimbcnt<<2), 0, pA );

    _bigint_heap.set( alimbs, pA>>2 );
    _bigint_heap.set( blimbs, pB>>2 );

    _bigint_asm.div( pA, alimbcnt<<2, pB, blimbcnt<<2, pR, pQ );

    qlimbcnt = _bigint_asm.tst( pQ, alimbcnt<<2 )>>2;
    if ( qlimbcnt ) {
        quotient = new BigNumber;
        quotient.limbs = new Uint32Array( _bigint_heap.subarray( pQ>>2, (pQ>>2)+qlimbcnt ) );
        quotient.bitLength = abitlen < (qlimbcnt<<5) ? abitlen : (qlimbcnt<<5);
        quotient.sign = this.sign * that.sign;
    }

    rlimbcnt = _bigint_asm.tst( pR, blimbcnt<<2 )>>2;
    if ( rlimbcnt ) {
        remainder = new BigNumber;
        remainder.limbs = new Uint32Array( _bigint_heap.subarray( pR>>2, (pR>>2)+rlimbcnt ) );;
        remainder.bitLength = bbitlen < (rlimbcnt<<5) ? bbitlen : (rlimbcnt<<5);
        remainder.sign = this.sign;
    }

    return {
        quotient: quotient,
        remainder: remainder
    };
}

///////////////////////////////////////////////////////////////////////////////

var BigNumberPrototype = BigNumber.prototype = new Number;
BigNumberPrototype.toString = BigNumber_toString;
BigNumberPrototype.toBytes = BigNumber_toBytes;
BigNumberPrototype.valueOf = BigNumber_valueOf;
BigNumberPrototype.clamp = BigNumber_clamp;
BigNumberPrototype.slice = BigNumber_slice;

///////////////////////////////////////////////////////////////////////////////

BigNumberPrototype.negate = BigNumber_negate;
BigNumberPrototype.compare = BigNumber_compare;
BigNumberPrototype.add = BigNumber_add;
BigNumberPrototype.subtract = BigNumber_subtract;
BigNumberPrototype.multiply = BigNumber_multiply;
BigNumberPrototype.square = BigNumber_square;
BigNumberPrototype.divide = BigNumber_divide;

///////////////////////////////////////////////////////////////////////////////

var BigNumber_ZERO = new BigNumber(0),
    BigNumber_ONE  = new BigNumber(1);

Object.freeze(BigNumber_ZERO);
Object.freeze(BigNumber_ONE);

function Number_extGCD ( a, b ) {
    var sa = ( a < 0 ) ? -1 : 1,
        sb = ( b < 0 ) ? -1 : 1,
        xi = 1, xj = 0,
        yi = 0, yj = 1,
        r, q, t, a_cmp_b;

    a *= sa;
    b *= sb;

    a_cmp_b = ( a < b );
    if ( a_cmp_b ) {
        t = a; a = b, b = t;
        t = sa; sa = sb; sb = t;
    }

    q = Math.floor( a / b ), r = a - q*b;
    while ( r ) {
        t = xi - q*xj, xi = xj, xj = t;
        t = yi - q*yj, yi = yj, yj = t;
        a = b, b = r;

        q = Math.floor( a / b ), r = a - q*b;
    }

    xj *= sa;
    yj *= sb;

    if ( a_cmp_b ) {
        t = xj; xj = yj, yj = t;
    }

    return {
        gcd: b,
        x: xj,
        y: yj
    };
}

function BigNumber_extGCD ( a, b ) {
    if ( !is_big_number(a) )
        a = new BigNumber(a);

    if ( !is_big_number(b) )
        b = new BigNumber(b);

    var sa = a.sign, sb = b.sign;

    if ( sa < 0 )
        a = a.negate();

    if ( sb < 0 )
        b = b.negate();

    var a_cmp_b = a.compare(b);
    if ( a_cmp_b < 0 ) {
        var t = a; a = b, b = t;
        t = sa; sa = sb; sb = t;
    }

    var xi = BigNumber_ONE, xj = BigNumber_ZERO, lx = b.bitLength,
        yi = BigNumber_ZERO, yj = BigNumber_ONE, ly = a.bitLength,
        z, r, q;

    z = a.divide(b);
    while ( (r = z.remainder) !== BigNumber_ZERO ) {
        q = z.quotient;

        z = xi.subtract( q.multiply(xj).clamp(lx) ).clamp(lx), xi = xj, xj = z;
        z = yi.subtract( q.multiply(yj).clamp(ly) ).clamp(ly), yi = yj, yj = z;

        a = b, b = r;

        z = a.divide(b);
    }

    if ( sa < 0 )
        xj = xj.negate();

    if ( sb < 0 )
        yj = yj.negate();

    if ( a_cmp_b < 0 ) {
        var t = xj; xj = yj, yj = t;
    }

    return {
        gcd: b,
        x: xj,
        y: yj
    };
}

/**
 * Modulus
 */
function Modulus () {
    BigNumber.apply( this, arguments );

    if ( this.valueOf() < 1 )
        throw new RangeError();

    if ( this.bitLength <= 32 )
        return;

    var comodulus;

    if ( this.limbs[0] & 1 ) {
        var bitlen = ( (this.bitLength+31) & -32 ) + 1, limbs = new Uint32Array( (bitlen+31) >> 5 );
        limbs[limbs.length-1] = 1;
        comodulus = new BigNumber();
        comodulus.sign = 1;
        comodulus.bitLength = bitlen;
        comodulus.limbs = limbs;

        var k = Number_extGCD( 0x100000000, this.limbs[0] ).y;
        this.coefficient = k < 0 ? -k : 0x100000000-k;
    }
    else {
        /**
         * TODO even modulus reduction
         * Modulus represented as `N = 2^U * V`, where `V` is odd and thus `GCD(2^U, V) = 1`.
         * Calculation `A = TR' mod V` is made as for odd modulo using Montgomery method.
         * Calculation `B = TR' mod 2^U` is easy as modulus is a power of 2.
         * Using Chinese Remainder Theorem and Garner's Algorithm restore `TR' mod N` from `A` and `B`.
         */
        return;
    }

    this.comodulus = comodulus;
    this.comodulusRemainder = comodulus.divide(this).remainder;
    this.comodulusRemainderSquare = comodulus.square().divide(this).remainder;
}

/**
 * Modular reduction
 */
function Modulus_reduce ( a ) {
    if ( !is_big_number(a) )
        a = new BigNumber(a);

    if ( a.bitLength <= 32 && this.bitLength <= 32 )
        return new BigNumber( a.valueOf() % this.valueOf() );

    if ( a.compare(this) < 0 )
        return a;

    return a.divide(this).remainder;
}

/**
 * Modular inverse
 */
function Modulus_inverse ( a ) {
    a = this.reduce(a);

    var r = BigNumber_extGCD( this, a );
    if ( r.gcd.valueOf() !== 1 ) return null;

    r = r.y;
    if ( r.sign < 0 ) r = r.add(this).clamp(this.bitLength);

    return r;
}

/**
 * Modular exponentiation
 */
function Modulus_power ( g, e ) {
    if ( !is_big_number(g) )
        g = new BigNumber(g);

    if ( !is_big_number(e) )
        e = new BigNumber(e);

    // count exponent set bits
    var c = 0;
    for ( var i = 0; i < e.limbs.length; i++ ) {
        var t = e.limbs[i];
        while ( t ) {
            if ( t & 1 ) c++;
            t >>>= 1;
        }
    }

    // window size parameter
    var k = 8;
    if ( e.bitLength <= 4536 ) k = 7;
    if ( e.bitLength <= 1736 ) k = 6;
    if ( e.bitLength <= 630 ) k = 5;
    if ( e.bitLength <= 210 ) k = 4;
    if ( e.bitLength <= 60 ) k = 3;
    if ( e.bitLength <= 12 ) k = 2;
    if ( c <= (1 << (k-1)) ) k = 1;

    // montgomerize base
    g = _Montgomery_reduce( this.reduce(g).multiply(this.comodulusRemainderSquare), this );

    // precompute odd powers
    var g2 = _Montgomery_reduce( g.square(), this ),
        gn = new Array( 1 << (k-1) );
    gn[0] = g;
    gn[1] = _Montgomery_reduce( g.multiply(g2), this );
    for ( var i = 2; i < (1 << (k-1)); i++ ) {
        gn[i] = _Montgomery_reduce( gn[i-1].multiply(g2), this );
    }

    // perform exponentiation
    var u = this.comodulusRemainder,
        r = u;
    for ( var i = e.limbs.length-1; i >= 0; i-- ) {
        var t = e.limbs[i];
        for ( var j = 32; j > 0; ) {
            if ( t & 0x80000000 ) {
                var n = t >>> (32-k), l = k;
                while ( (n & 1) === 0 ) { n >>>= 1; l--; }
                var m = gn[n>>>1];
                while ( n ) { n >>>= 1; if ( r !== u ) r = _Montgomery_reduce( r.square(), this ); }
                r = ( r !== u ) ? _Montgomery_reduce( r.multiply(m), this ) : m;
                t <<= l, j -= l;
            }
            else {
                if ( r !== u ) r = _Montgomery_reduce( r.square(), this );
                t <<= 1, j--;
            }
        }
    }

    // de-montgomerize result
    r = _Montgomery_reduce( r, this );

    return r;
}

function _Montgomery_reduce ( a, n ) {
    var alimbs = a.limbs, alimbcnt = alimbs.length,
        nlimbs = n.limbs, nlimbcnt = nlimbs.length,
        y = n.coefficient;

    _bigint_asm.sreset();

    var pA = _bigint_asm.salloc( alimbcnt<<2 ),
        pN = _bigint_asm.salloc( nlimbcnt<<2 ),
        pR = _bigint_asm.salloc( nlimbcnt<<2 );

    _bigint_asm.z( pR-pA+(nlimbcnt<<2), 0, pA );

    _bigint_heap.set( alimbs, pA>>2 );
    _bigint_heap.set( nlimbs, pN>>2 );

    _bigint_asm.mredc( pA, alimbcnt<<2, pN, nlimbcnt<<2, y, pR );

    var result = new BigNumber();
    result.limbs = new Uint32Array( _bigint_heap.subarray( pR>>2, (pR>>2)+nlimbcnt ) );
    result.bitLength = n.bitLength;
    result.sign = 1;

    return result;
}

var ModulusPrototype = Modulus.prototype = new BigNumber;
ModulusPrototype.reduce = Modulus_reduce;
ModulusPrototype.inverse = Modulus_inverse;
ModulusPrototype.power = Modulus_power;

// Tests if the number supplied is a Miller-Rabin strong probable prime
function _BigNumber_isMillerRabinProbablePrime ( rounds ) {
    var t = new BigNumber(this),
        s = 0;
    t.limbs[0] -= 1;
    while ( t.limbs[s>>5] === 0 ) s += 32;
    while ( ( ( t.limbs[s>>5] >> (s & 31) ) & 1 ) === 0 ) s++;
    t = t.slice(s);

    var m = new Modulus(this),
        m1 = this.subtract(BigNumber_ONE),
        a = new BigNumber(this),
        l = this.limbs.length-1;
    while ( a.limbs[l] === 0 ) l--;

    while ( --rounds >= 0 ) {
        Random_getValues(a.limbs);
        if ( a.limbs[0] < 2 ) a.limbs[0] += 2;
        while ( a.compare(m1) >= 0 ) a.limbs[l] >>>= 1;

        var x = m.power( a, t );
        if ( x.compare(BigNumber_ONE) === 0 ) continue;
        if ( x.compare(m1) === 0 ) continue;

        var c = s;
        while ( --c > 0 ) {
            x = x.square().divide(m).remainder;
            if ( x.compare(BigNumber_ONE) === 0 ) return false;
            if ( x.compare(m1) === 0 ) break;
        }

        if ( c === 0 ) return false;
    }

    return true;
}

function BigNumber_isProbablePrime ( paranoia ) {
    paranoia = paranoia || 80;

    var limbs = this.limbs,
        i = 0;

    // Oddity test
    // (50% false positive probability)
    if ( ( limbs[0] & 1 ) === 0 ) return false;
    if ( paranoia <= 1 ) return true;

    // Magic divisors (3, 5, 17) test
    // (~25% false positive probability)
    var s3 = 0, s5 = 0, s17 = 0;
    for ( i = 0; i < limbs.length; i++ ) {
        var l3 = limbs[i];
        while ( l3 ) {
            s3 += (l3 & 3);
            l3 >>>= 2;
        }

        var l5 = limbs[i];
        while ( l5 ) {
            s5 += (l5 & 3);
            l5 >>>= 2;
            s5 -= (l5 & 3);
            l5 >>>= 2;
        }

        var l17 = limbs[i];
        while ( l17 ) {
            s17 += (l17 & 15);
            l17 >>>= 4;
            s17 -= (l17 & 15);
            l17 >>>= 4;
        }
    }
    if ( !(s3 % 3) || !(s5 % 5) || !(s17 % 17) ) return false;
    if ( paranoia <= 2 ) return true;

    // Miller-Rabin test
    // (≤ 4^(-k) false positive probability)
    return _BigNumber_isMillerRabinProbablePrime.call( this, paranoia >>> 1 );
}

// Small primes for trail division
var _primes = [ 2, 3 /* and so on, computed lazily */ ];

// Returns an array populated with first n primes.
function _small_primes ( n ) {
    if ( _primes.length >= n )
        return _primes.slice( 0, n );

    for ( var p = _primes[_primes.length-1] + 2; _primes.length < n; p += 2 ) {
        for ( var i = 0, d = _primes[i]; d*d <= p; d = _primes[++i] ) {
            if ( p % d == 0 ) break;
        }
        if ( d*d > p ) _primes.push(p);
    }

    return _primes;
}

// Returns strong pseudoprime of a specified bit length
function BigNumber_randomProbablePrime ( bitlen, filter ) {
    var limbcnt = (bitlen + 31) >> 5,
        prime = new BigNumber({ sign: 1, bitLength: bitlen, limbs: limbcnt }),
        limbs = prime.limbs;

    // Number of small divisors to try that minimizes the total cost of the trial division
    // along with the first round of Miller-Rabin test for a certain bit length.
    var k = 10000;
    if ( bitlen <= 512 ) k = 2200;
    if ( bitlen <= 256 ) k = 600;

    var divisors = _small_primes(k),
        remainders = new Uint32Array(k);

    // Number of Miller-Rabin iterations for an error rate  of less than 2^-80
    // Damgaard, Landrock, Pomerance: Average case error estimates for the strong probable prime test.
    var s = (bitlen * global.Math.LN2) | 0,
        r = 27;
    if ( bitlen >= 250 ) r = 12;
    if ( bitlen >= 450 ) r = 6;
    if ( bitlen >= 850 ) r = 3;
    if ( bitlen >= 1300 ) r = 2;

    while ( true ) {
        // populate `prime` with random bits, clamp to the appropriate bit length
        Random_getValues(limbs);
        limbs[0] |= 1;
        limbs[limbcnt-1] |= 1 << ((bitlen - 1) & 31);
        if ( bitlen & 31 ) limbs[limbcnt-1] &= pow2_ceil((bitlen + 1) & 31) - 1;

        // remainders from division to small primes
        remainders[0] = 1;
        for ( var i = 1; i < k; i++ ) {
            remainders[i] = prime.divide( divisors[i] ).remainder.valueOf();
        }

        // try no more than `s` subsequent candidates
        seek:
        for ( var j = 0; j < s; j += 2, limbs[0] += 2 ) {
            // check for small factors
            for ( var i = 1; i < k; i++ ) {
                if ( ( remainders[i] + j ) % divisors[i] === 0 ) continue seek;
            }

            // additional check just before the heavy lifting
            if ( typeof filter === 'function' && !filter(prime) ) continue;

            // proceed to Miller-Rabin test
            if ( _BigNumber_isMillerRabinProbablePrime.call( prime, r ) ) return prime;
        }
    }
}

BigNumberPrototype.isProbablePrime = BigNumber_isProbablePrime;

BigNumber.randomProbablePrime = BigNumber_randomProbablePrime;

BigNumber.ZERO = BigNumber_ZERO;
BigNumber.ONE  = BigNumber_ONE;

BigNumber.extGCD = BigNumber_extGCD;

exports.BigNumber = BigNumber;
exports.Modulus = Modulus;

function RSA ( options ) {
    options = options || {};

    this.key = null;
    this.result = null;

    this.reset(options);
}

function RSA_reset ( options ) {
    options = options || {};

    this.result = null;

    var key = options.key
    if ( key !== undefined ) {
        if ( key instanceof Array ) {
            var l = key.length;
            if ( l !== 2 && l !== 3 && l !== 8 )
                throw new SyntaxError("unexpected key type");

            var k = [];
            k[0] = new Modulus( key[0] );
            k[1] = new BigNumber( key[1] );
            if ( l > 2 ) {
                k[2] = new BigNumber( key[2] );
            }
            if ( l > 3 ) {
                k[3] = new Modulus( key[3] );
                k[4] = new Modulus( key[4] );
                k[5] = new BigNumber( key[5] );
                k[6] = new BigNumber( key[6] );
                k[7] = new BigNumber( key[7] );
            }

            this.key = k;
        }
        else {
            throw new TypeError("unexpected key type");
        }
    }

    return this;
}

function RSA_encrypt ( data ) {
    if ( !this.key )
        throw new IllegalStateError("no key is associated with the instance");

    if ( is_string(data) )
        data = string_to_bytes(data);

    if ( is_buffer(data) )
        data = new Uint8Array(data);

    var msg;
    if ( is_bytes(data) ) {
        msg = new BigNumber(data);
    }
    else if ( is_big_number(data) ) {
        msg = data;
    }
    else {
        throw new TypeError("unexpected data type");
    }

    if ( this.key[0].compare(msg) <= 0 )
        throw new RangeError("data too large");

    var m = this.key[0],
        e = this.key[1];

    var result = m.power( msg, e ).toBytes();

    var bytelen = m.bitLength + 7 >> 3;
    if ( result.length < bytelen ) {
        var r = new Uint8Array(bytelen);
        r.set( result, bytelen - result.length );
        result = r;
    }

    this.result = result;

    return this;
}

function RSA_decrypt ( data ) {
    if ( !this.key )
        throw new IllegalStateError("no key is associated with the instance");

    if ( this.key.length < 3 )
        throw new IllegalStateError("key isn't suitable for decription");

    if ( is_string(data) )
        data = string_to_bytes(data);

    if ( is_buffer(data) )
        data = new Uint8Array(data);

    var msg;
    if ( is_bytes(data) ) {
        msg = new BigNumber(data);
    }
    else if ( is_big_number(data) ) {
        msg = data;
    }
    else {
        throw new TypeError("unexpected data type");
    }

    if ( this.key[0].compare(msg) <= 0 )
        throw new RangeError("data too large");

    var result;
    if ( this.key.length > 3 ) {
        var m = this.key[0],
            p = this.key[3],
            q = this.key[4],
            dp = this.key[5],
            dq = this.key[6],
            u = this.key[7];

        var x = p.power( msg, dp ),
            y = q.power( msg, dq );

        var t = x.subtract(y);
        while ( t.sign < 0 ) t = t.add(p);

        var h = p.reduce( u.multiply(t) );

        result = h.multiply(q).add(y).clamp(m.bitLength).toBytes();
    }
    else {
        var m = this.key[0],
            d = this.key[2];

        result = m.power( msg, d ).toBytes();
    }

    var bytelen = m.bitLength + 7 >> 3;
    if ( result.length < bytelen ) {
        var r = new Uint8Array(bytelen);
        r.set( result, bytelen - result.length );
        result = r;
    }

    this.result = result;

    return this;
}

var RSA_prototype = RSA.prototype;
RSA_prototype.reset = RSA_reset;
RSA_prototype.encrypt = RSA_encrypt;
RSA_prototype.decrypt = RSA_decrypt;

/**
 * Generate RSA key pair
 *
 * @param bitlen desired modulus length, default is 2048
 * @param e public exponent, default is 65537
 */
function RSA_generateKey ( bitlen, e ) {
    bitlen = bitlen || 2048;
    e      = e      || 65537;

    if ( bitlen < 512 )
        throw new IllegalArgumentError("bit length is too small");

    if ( is_string(e) )
        e = string_to_bytes(e);

    if ( is_buffer(e) )
        e = new Uint8Array(e);

    if ( is_bytes(e) || is_number(e) || is_big_number(e) ) {
        e = new BigNumber(e);
    }
    else {
        throw new TypeError("unexpected exponent type");
    }

    if ( ( e.limbs[0] & 1 ) === 0 )
        throw new IllegalArgumentError("exponent must be an odd number");

    var m, e, d, p, q, p1, q1, dp, dq, u;

    p = BigNumber_randomProbablePrime(
        bitlen >> 1,
        function ( p ) {
            p1 = new BigNumber(p); p1.limbs[0] -= 1;
            return BigNumber_extGCD( p1, e ).gcd.valueOf() == 1;
        }
    );

    q = BigNumber_randomProbablePrime(
        bitlen - (bitlen >> 1),
        function ( q ) {
            m = new Modulus( p.multiply(q) );
            if ( !( m.limbs[ ( (bitlen + 31) >> 5 ) - 1 ] >>> ( (bitlen - 1) & 31) ) ) return false;
            q1 = new BigNumber(q); q1.limbs[0] -= 1;
            return BigNumber_extGCD( q1, e ).gcd.valueOf() == 1;
        }
    );

    d = new Modulus( p1.multiply(q1) ).inverse(e);

    dp = d.divide(p1).remainder,
    dq = d.divide(q1).remainder;

    p = new Modulus(p),
    q = new Modulus(q);

    var u = p.inverse(q);

    return [ m, e, d, p, q, dp, dq, u ];
}

RSA.generateKey = RSA_generateKey;


var RSA_RAW = RSA;

function RSA_OAEP ( options ) {
    options = options || {};

    if ( !options.hash )
        throw new SyntaxError("option 'hash' is required");

    if ( !options.hash.HASH_SIZE )
        throw new SyntaxError("option 'hash' supplied doesn't seem to be a valid hash function");

    this.hash = options.hash;

    this.label = null;

    this.reset(options);
}

function RSA_OAEP_reset ( options ) {
    options = options || {};

    var label = options.label;
    if ( label !== undefined ) {
        if ( is_buffer(label) || is_bytes(label) ) {
            label = new Uint8Array(label);
        }
        else if ( is_string(label) ) {
            label = string_to_bytes(label);
        }
        else {
            throw new TypeError("unexpected label type");
        }

        this.label = ( label.length > 0 ) ? label : null;
    }
    else {
        this.label = null;
    }

    RSA_reset.call( this, options );
}

function RSA_OAEP_encrypt ( data ) {
    if ( !this.key )
        throw new IllegalStateError("no key is associated with the instance");

    var key_size = Math.ceil( this.key[0].bitLength / 8 ),
        hash_size = this.hash.HASH_SIZE,
        data_length = data.byteLength || data.length || 0,
        ps_length = key_size - data_length - 2*hash_size - 2;

    if ( data_length > key_size - 2*this.hash.HASH_SIZE - 2 )
        throw new IllegalArgumentError("data too large");

    var message = new Uint8Array(key_size),
        seed = message.subarray( 1, hash_size + 1 ),
        data_block = message.subarray( hash_size + 1 );

    if ( is_bytes(data) ) {
        data_block.set( data, hash_size + ps_length + 1 );
    }
    else if ( is_buffer(data) ) {
        data_block.set( new Uint8Array(data), hash_size + ps_length + 1 );
    }
    else if ( is_string(data) ) {
        data_block.set( string_to_bytes(data), hash_size + ps_length + 1 );
    }
    else {
        throw new TypeError("unexpected data type");
    }

    data_block.set( this.hash.reset().process( this.label || '' ).finish().result, 0 );
    data_block[ hash_size + ps_length ] = 1;

    Random_getValues(seed);

    var data_block_mask = RSA_MGF1_generate.call( this, seed, data_block.length );
    for ( var i = 0; i < data_block.length; i++ )
        data_block[i] ^= data_block_mask[i];

    var seed_mask = RSA_MGF1_generate.call( this, data_block, seed.length );
    for ( var i = 0; i < seed.length; i++ )
        seed[i] ^= seed_mask[i];

    RSA_encrypt.call( this, message );

    return this;
}

function RSA_OAEP_decrypt ( data ) {
    if ( !this.key )
        throw new IllegalStateError("no key is associated with the instance");

    var key_size = Math.ceil( this.key[0].bitLength / 8 ),
        hash_size = this.hash.HASH_SIZE,
        data_length = data.byteLength || data.length || 0;

    if ( data_length !== key_size )
        throw new IllegalArgumentError("bad data");

    RSA_decrypt.call( this, data );

    var z = this.result[0],
        seed = this.result.subarray( 1, hash_size + 1 ),
        data_block = this.result.subarray( hash_size + 1 );

    if ( z !== 0 )
        throw new SecurityError("decryption failed");

    var seed_mask = RSA_MGF1_generate.call( this, data_block, seed.length );
    for ( var i = 0; i < seed.length; i++ )
        seed[i] ^= seed_mask[i];

    var data_block_mask = RSA_MGF1_generate.call( this, seed, data_block.length );
    for ( var i = 0; i < data_block.length; i++ )
        data_block[i] ^= data_block_mask[i];

    var lhash = this.hash.reset().process( this.label || '' ).finish().result;
    for ( var i = 0; i < hash_size; i++ ) {
        if ( lhash[i] !== data_block[i] )
            throw new SecurityError("decryption failed");
    }

    var ps_end = hash_size;
    for ( ; ps_end < data_block.length; ps_end++ ) {
        var psz = data_block[ps_end];
        if ( psz === 1 )
            break;
        if ( psz !== 0 )
            throw new SecurityError("decryption failed");
    }
    if ( ps_end === data_block.length )
        throw new SecurityError("decryption failed");

    this.result = data_block.subarray( ps_end + 1 );

    return this;
}

function RSA_MGF1_generate( seed, length ) {
    seed = seed || '';
    length = length || 0;

    var hash_size = this.hash.HASH_SIZE;
//    if ( length > (hash_size * 0x100000000) )
//        throw new IllegalArgumentError("mask length too large");

    var mask = new Uint8Array(length),
        counter = new Uint8Array(4),
        chunks = Math.ceil( length / hash_size );
    for ( var i = 0; i < chunks; i++ ) {
        counter[0] = i >>> 24,
        counter[1] = (i >>> 16) & 255,
        counter[2] = (i >>> 8) & 255,
        counter[3] = i & 255;

        var submask = mask.subarray( i * hash_size );

        var chunk = this.hash.reset().process(seed).process(counter).finish().result;
        if ( chunk.length > submask.length ) chunk = chunk.subarray( 0, submask.length );

        submask.set(chunk);
    }

    return mask;
}

function RSA_PSS ( options ) {
    options = options || {};

    if ( !options.hash )
        throw new SyntaxError("option 'hash' is required");

    if ( !options.hash.HASH_SIZE )
        throw new SyntaxError("option 'hash' supplied doesn't seem to be a valid hash function");

    this.hash = options.hash;

    this.saltLength = 4;

    this.reset(options);
}

function RSA_PSS_reset ( options ) {
    options = options || {};

    RSA_reset.call( this, options );

    var slen = options.saltLength;
    if ( slen !== undefined ) {
        if ( !is_number(slen) || slen < 0 )
            throw new TypeError("saltLength should be a non-negative number");

        if ( this.key !== null && Math.ceil( ( this.key[0].bitLength - 1 ) / 8 ) < this.hash.HASH_SIZE + slen + 2 )
            throw new SyntaxError("saltLength is too large");

        this.saltLength = slen;
    }
    else {
        this.saltLength = 4;
    }
}

function RSA_PSS_sign ( data ) {
    if ( !this.key )
        throw new IllegalStateError("no key is associated with the instance");

    var key_bits = this.key[0].bitLength,
        hash_size = this.hash.HASH_SIZE,
        message_length = Math.ceil( ( key_bits - 1 ) / 8 ),
        salt_length = this.saltLength,
        ps_length = message_length - salt_length - hash_size - 2;

    var message = new Uint8Array(message_length),
        h_block = message.subarray( message_length - hash_size - 1, message_length - 1 ),
        d_block = message.subarray( 0, message_length - hash_size - 1 ),
        d_salt = d_block.subarray( ps_length + 1 );

    var m_block = new Uint8Array( 8 + hash_size + salt_length ),
        m_hash = m_block.subarray( 8, 8 + hash_size ),
        m_salt = m_block.subarray( 8 + hash_size );

    m_hash.set( this.hash.reset().process(data).finish().result );

    if ( salt_length > 0 )
        Random_getValues(m_salt);

    d_block[ps_length] = 1;
    d_salt.set(m_salt);

    h_block.set( this.hash.reset().process(m_block).finish().result );

    var d_block_mask = RSA_MGF1_generate.call( this, h_block, d_block.length );
    for ( var i = 0; i < d_block.length; i++ )
        d_block[i] ^= d_block_mask[i];

    message[message_length-1] = 0xbc;

    var zbits = 8*message_length - key_bits + 1;
    if ( zbits % 8 ) message[0] &= (0xff >>> zbits);

    RSA_decrypt.call( this, message );

    return this;
}

function RSA_PSS_verify ( signature, data ) {
    if ( !this.key )
        throw new IllegalStateError("no key is associated with the instance");

    var key_bits = this.key[0].bitLength,
        hash_size = this.hash.HASH_SIZE,
        message_length = Math.ceil( ( key_bits - 1 ) / 8 ),
        salt_length = this.saltLength,
        ps_length = message_length - salt_length - hash_size - 2;

    RSA_encrypt.call( this, signature );

    var message = this.result;
    if ( message[message_length-1] !== 0xbc )
        throw new SecurityError("bad signature");

    var h_block = message.subarray( message_length - hash_size - 1, message_length - 1 ),
        d_block = message.subarray( 0, message_length - hash_size - 1 ),
        d_salt = d_block.subarray( ps_length + 1 );

    var zbits = 8*message_length - key_bits + 1;
    if ( (zbits % 8) && (message[0] >>> (8-zbits)) )
        throw new SecurityError("bad signature");

    var d_block_mask = RSA_MGF1_generate.call( this, h_block, d_block.length );
    for ( var i = 0; i < d_block.length; i++ )
        d_block[i] ^= d_block_mask[i];

    if ( zbits % 8 ) message[0] &= (0xff >>> zbits);

    for ( var i = 0; i < ps_length; i++ ) {
        if ( d_block[i] !== 0 )
            throw new SecurityError("bad signature");
    }
    if ( d_block[ps_length] !== 1 )
        throw new SecurityError("bad signature");

    var m_block = new Uint8Array( 8 + hash_size + salt_length ),
        m_hash = m_block.subarray( 8, 8 + hash_size ),
        m_salt = m_block.subarray( 8 + hash_size );

    m_hash.set( this.hash.reset().process(data).finish().result );
    m_salt.set( d_salt );

    var h_block_verify = this.hash.reset().process(m_block).finish().result;
    for ( var i = 0; i < hash_size; i++ ) {
        if ( h_block[i] !== h_block_verify[i] )
            throw new SecurityError("bad signature");
    }

    return this;
}

var RSA_OAEP_prototype = RSA_OAEP.prototype;
RSA_OAEP_prototype.reset = RSA_OAEP_reset;
RSA_OAEP_prototype.encrypt = RSA_OAEP_encrypt;
RSA_OAEP_prototype.decrypt = RSA_OAEP_decrypt;

var RSA_PSS_prototype = RSA_PSS.prototype;
RSA_PSS_prototype.reset = RSA_PSS_reset;
RSA_PSS_prototype.sign = RSA_PSS_sign;
RSA_PSS_prototype.verify = RSA_PSS_verify;

/**
 * RSA keygen exports
 */
function rsa_generate_key ( bitlen, e ) {
    if ( bitlen === undefined ) throw new SyntaxError("bitlen required");
    if ( e === undefined ) throw new SyntaxError("e required");
    var key = RSA_generateKey( bitlen, e );
    for ( var i = 0; i < key.length; i++ ) {
        if ( is_big_number(key[i]) )
            key[i] = key[i].toBytes();
    }
    return key;
}

exports.RSA = {
    generateKey: rsa_generate_key
};

/**
 * RSA-RAW exports
 */

function rsa_raw_encrypt_bytes ( data, key ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    return (new RSA_RAW({ key: key })).encrypt(data).result;
}

function rsa_raw_decrypt_bytes ( data, key ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    return (new RSA_RAW({ key: key })).decrypt(data).result;
}

RSA_RAW.encrypt = rsa_raw_encrypt_bytes;
RSA_RAW.decrypt = rsa_raw_decrypt_bytes;
RSA_RAW.sign = rsa_raw_decrypt_bytes;
RSA_RAW.verify = rsa_raw_encrypt_bytes;

exports.RSA_RAW = RSA_RAW;

/**
 * RSA-OAEP-SHA256 exports
 */

function rsa_oaep_sha256_encrypt_bytes ( data, key, label ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    return (new RSA_OAEP({ hash: get_sha256_instance(), key: key, label: label })).encrypt(data).result;
}

function rsa_oaep_sha256_decrypt_bytes ( data, key, label ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    return (new RSA_OAEP({ hash: get_sha256_instance(), key: key, label: label })).decrypt(data).result;
}

exports.RSA_OAEP = RSA_OAEP;

exports.RSA_OAEP_SHA256 = {
    encrypt: rsa_oaep_sha256_encrypt_bytes,
    decrypt: rsa_oaep_sha256_decrypt_bytes
};

/**
 * RSA-PSS-SHA256 exports
 */

function rsa_pss_sha256_sign_bytes ( data, key, slen ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    return (new RSA_PSS({ hash: get_sha256_instance(), key: key, saltLength: slen })).sign(data).result;
}

function rsa_pss_sha256_verify_bytes ( signature, data, key, slen ) {
    if ( signature === undefined ) throw new SyntaxError("signature required");
    if ( data === undefined ) throw new SyntaxError("data required");
    if ( key === undefined ) throw new SyntaxError("key required");
    try {
        (new RSA_PSS({ hash: get_sha256_instance(), key: key, saltLength: slen })).verify(signature, data);
        return true;
    }
    catch ( e ) {
        if ( !( e instanceof SecurityError ) )
            throw e;
    }
    return false;
}

exports.RSA_PSS = RSA_PSS;

exports.RSA_PSS_SHA256 = {
    sign: rsa_pss_sha256_sign_bytes,
    verify: rsa_pss_sha256_verify_bytes
};

global.asmCrypto=exports;
}( {}, function(){return this}() );
//# sourceMappingURL=asmcrypto.js.map