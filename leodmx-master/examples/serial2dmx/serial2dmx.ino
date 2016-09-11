/**
 * Serial-to-DMX Interface
 * for Arduino Leonardo & Micro
 * 
 * A damn simple minimal solution:
 * 
 * – connect your Arduino to your computer and upload the sketch
 * 
 * – open a serial connection at your computer:
 *   > standard options: 8 data bits, 1 stop bit, no parity
 *   > choose any baud rate up to 115200
 *     (no need to change the sketch – don't worry, they will sync)
 * 
 * – send up to 512 bytes, representing the binary channel data
 * 
 * – wait for the Arduino to reply
 *   > the Arduino reads as much as you send it
 *   > after having received 512 bytes or
 *     after a break of few milliseconds (see hostDataGap below)
 *     the Arduino forwards the received data to the DMX bus
 * 
 * – the Arduino's response indicates the number of bytes forwarded,
 *   e.g. "OK:64" when having sent 64 bytes
 *
 * This sketch uses the default settings of LeoDMX:
 * > data output:     digital pin 1
 * > transmit enable: digital pin 2 (HIGH during transmit)
 *
 * Nick Schwarzenberg,
 * 09/2014, v0.1.1
 */


// include DMX library
#include <LeoDMX.class.h>

// set version
#define VERSION "0.1.1"


// host communication speed
const unsigned long hostBaud = 115200;

// host data timeout [ms] (gap to identify end of data block)
const unsigned short hostDataGap = 3;

// get DMX instance
LeoDMX DMX;

// channel data
char channels[512] = {0};


// prepare host communication
void setup()
{
    // wait for host to be ready
    while ( !Serial );
    
    // set up communication
    Serial.begin( hostBaud );
    Serial.setTimeout( hostDataGap );
    
    // say hello
    Serial.println( "Serial2DMX v" VERSION );
    
    // reset DMX universe
    DMX.null();
}


// collect and forward channel data
void loop()
{
    // read up to 512 channel bytes
    short count = Serial.readBytes( channels, 512 );
    
    // if read was successful
    if ( count > 0 )
    {
        // forward received data
        DMX.send( (unsigned char*) channels, count );
        
        // tell host how many bytes were forwarded
        Serial.print( "OK:" );
        Serial.println( count );
    }
}
